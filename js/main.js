// ---- state ----
let pantry = [];
let matchMap = new Map(); // idMeal -> { idMeal, strMeal, strMealThumb, count }, recomputed on every pantry change
let selectedCuisine = null; // null = not chosen yet, "" = "Any cuisine", otherwise a cuisine name
let allCuisineNames = []; // fetched once from list.php?a=list
const cuisineMealIdsCache = new Map(); // cuisine name -> Set of idMeal, fetched once per cuisine, reused forever
const detailCache = new Map(); // idMeal -> full meal object

const TOP_CUISINE_COUNT = 6;
const MAX_ENRICHED_RESULTS = 12;

// ---- DOM refs ----
const pantryForm = document.getElementById("pantry-form");
const ingredientInput = document.getElementById("ingredient-input");
const pantryListEl = document.getElementById("pantry-list");

const cuisineSection = document.getElementById("cuisine-section");
const cuisineStatusEl = document.getElementById("cuisine-status");
const cuisineOptionsEl = document.getElementById("cuisine-options");

const resultsSection = document.getElementById("results-section");
const resultsBackBtn = document.getElementById("results-back");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const detailSection = document.getElementById("detail-section");
const detailContent = document.getElementById("detail-content");
const detailClose = document.getElementById("detail-close");

// ---- helpers ----

// TheMealDB stores ingredients as strIngredient1..20 / strMeasure1..20.
function extractIngredients(meal) {
  const items = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (!name || !name.trim()) break;
    items.push({ name: name.trim(), measure: (measure || "").trim() });
  }
  return items;
}

// Loose match so "chicken" in your pantry matches "Chicken Breast" in a recipe, and vice versa.
function ingredientInPantry(ingredientName) {
  const lower = ingredientName.toLowerCase();
  return pantry.some((p) => lower.includes(p) || p.includes(lower));
}

function showStep(step) {
  cuisineSection.hidden = step !== "cuisine";
  resultsSection.hidden = step !== "results";
  detailSection.hidden = true;
}

// ---- pantry management ----

function renderPantry() {
  pantryListEl.innerHTML = "";
  pantry.forEach((item) => {
    const li = document.createElement("li");
    li.className = "pantry-chip";

    const label = document.createElement("span");
    label.textContent = item;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "chip-remove";
    removeBtn.setAttribute("aria-label", `Remove ${item}`);
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", () => removeIngredient(item));

    li.appendChild(label);
    li.appendChild(removeBtn);
    pantryListEl.appendChild(li);
  });
}

function addIngredient(raw) {
  const ingredient = raw.trim().toLowerCase();
  if (!ingredient || pantry.includes(ingredient)) return;
  pantry.push(ingredient);
  renderPantry();
  refreshCuisineStep();
}

function removeIngredient(ingredient) {
  pantry = pantry.filter((p) => p !== ingredient);
  renderPantry();
  refreshCuisineStep();
}

pantryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addIngredient(ingredientInput.value);
  ingredientInput.value = "";
  ingredientInput.focus();
});

// ---- step 1 -> step 2: match ingredients, then recommend cuisines ----

async function computeMatchMap() {
  const settled = await Promise.allSettled(
    pantry.map((ingredient) => fetchMealsByIngredient(ingredient))
  );

  const resultsByIngredient = settled.map((result) => {
    if (result.status === "fulfilled") return result.value;
    console.error("Ingredient lookup failed:", result.reason);
    return null; // treat a single failed ingredient as "no matches", not a hard error
  });

  const map = new Map();
  resultsByIngredient.forEach((meals) => {
    if (!meals) return;
    meals.forEach((meal) => {
      const existing = map.get(meal.idMeal);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(meal.idMeal, {
          idMeal: meal.idMeal,
          strMeal: meal.strMeal,
          strMealThumb: meal.strMealThumb,
          count: 1,
        });
      }
    });
  });
  return map;
}

// Fetch every cuisine's full meal-id list once, then cache it for the rest of the session.
async function ensureCuisineSetsCached() {
  if (!allCuisineNames.length) {
    const areas = await fetchCuisineList();
    allCuisineNames = (areas || []).map((a) => a.strArea);
  }

  const uncached = allCuisineNames.filter((name) => !cuisineMealIdsCache.has(name));
  if (uncached.length === 0) return;

  const settled = await Promise.allSettled(uncached.map((name) => fetchMealsByArea(name)));
  uncached.forEach((name, i) => {
    const result = settled[i];
    if (result.status === "fulfilled") {
      cuisineMealIdsCache.set(name, new Set((result.value || []).map((m) => m.idMeal)));
    } else {
      console.error(`Cuisine lookup failed for ${name}:`, result.reason);
      cuisineMealIdsCache.set(name, new Set()); // treat as "no matches" rather than retrying forever
    }
  });
}

async function refreshCuisineStep() {
  selectedCuisine = null;
  showStep("cuisine");
  cuisineOptionsEl.innerHTML = "";

  if (pantry.length === 0) {
    matchMap = new Map();
    cuisineStatusEl.textContent = "Add a few ingredients above to see cuisine recommendations.";
    return;
  }

  cuisineStatusEl.textContent = "Looking for cuisines that fit...";

  try {
    matchMap = await computeMatchMap();

    if (matchMap.size === 0) {
      cuisineStatusEl.textContent = "No recipes found for that combination. Try different ingredients.";
      return;
    }

    await ensureCuisineSetsCached();

    const counts = allCuisineNames
      .map((name) => {
        const ids = cuisineMealIdsCache.get(name) || new Set();
        let count = 0;
        for (const id of matchMap.keys()) {
          if (ids.has(id)) count += 1;
        }
        return { name, count };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);

    renderCuisineOptions(counts, matchMap.size);
    cuisineStatusEl.textContent =
      `${matchMap.size} recipe${matchMap.size === 1 ? "" : "s"} match your ingredients. ` +
      "Pick a cuisine, or see everything.";
  } catch (err) {
    console.error(err);
    cuisineStatusEl.textContent = "Couldn't reach TheMealDB right now. Try again in a moment.";
  }
}

function renderCuisineOptions(counts, totalCount) {
  cuisineOptionsEl.innerHTML = "";

  const anyBtn = document.createElement("button");
  anyBtn.type = "button";
  anyBtn.className = "cuisine-chip cuisine-chip-any";
  anyBtn.textContent = `Any cuisine \u2014 ${totalCount} dish${totalCount === 1 ? "" : "es"}`;
  anyBtn.addEventListener("click", () => chooseCuisine(""));
  cuisineOptionsEl.appendChild(anyBtn);

  counts.slice(0, TOP_CUISINE_COUNT).forEach(({ name, count }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cuisine-chip";
    btn.textContent = `${name} \u2014 ${count} dish${count === 1 ? "" : "es"}`;
    btn.addEventListener("click", () => chooseCuisine(name));
    cuisineOptionsEl.appendChild(btn);
  });
}

// ---- step 2 -> step 3: show dishes for the chosen cuisine ----

function chooseCuisine(cuisine) {
  selectedCuisine = cuisine; // "" means "any cuisine"
  showDishes();
}

async function showDishes() {
  showStep("results");
  statusEl.textContent = "Loading dishes...";
  resultsEl.innerHTML = "";

  let candidates = Array.from(matchMap.values());
  if (selectedCuisine) {
    const ids = cuisineMealIdsCache.get(selectedCuisine) || new Set();
    candidates = candidates.filter((m) => ids.has(m.idMeal));
  }

  const ranked = candidates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.strMeal.localeCompare(b.strMeal);
  });

  const topMatches = ranked.slice(0, MAX_ENRICHED_RESULTS);

  const cuisineLabel = selectedCuisine ? ` in ${selectedCuisine} cuisine` : "";
  const countLabel = `${ranked.length} recipe${ranked.length === 1 ? "" : "s"} found${cuisineLabel}, sorted by best match`;
  const capLabel = ranked.length > MAX_ENRICHED_RESULTS ? ` (showing top ${MAX_ENRICHED_RESULTS})` : "";
  statusEl.textContent = `${countLabel}${capLabel}.`;

  try {
    await Promise.all(
      topMatches.map(async (match) => {
        if (!detailCache.has(match.idMeal)) {
          const details = await fetchMealDetails(match.idMeal);
          if (details) detailCache.set(match.idMeal, details);
        }
      })
    );
    renderResults(topMatches);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't reach TheMealDB right now. Try again in a moment.";
  }
}

function renderResults(matches) {
  resultsEl.innerHTML = "";
  matches.forEach((match) => {
    const card = document.createElement("article");
    card.className = "recipe-card";
    card.innerHTML = `
      <img src="${match.strMealThumb}/small" alt="${match.strMeal}" width="200" height="200" loading="lazy">
      <div class="recipe-info">
        <p class="recipe-name">${match.strMeal}</p>
        <p class="recipe-match">${match.count} of ${pantry.length} ingredients matched</p>
      </div>
    `;
    card.addEventListener("click", () => openDetail(match.idMeal));
    resultsEl.appendChild(card);
  });
}

resultsBackBtn.addEventListener("click", () => {
  showStep("cuisine");
});

// ---- detail view ----

function openDetail(idMeal) {
  const meal = detailCache.get(idMeal);
  if (!meal) return;

  const ingredients = extractIngredients(meal);

  const listHtml = ingredients
    .map((item) => {
      const owned = ingredientInPantry(item.name);
      return `
        <li class="ingredient-row ${owned ? "owned" : "missing"}">
          <span class="ingredient-mark">${owned ? "\u2713" : ""}</span>
          <span class="ingredient-name">${item.name}</span>
          <span class="ingredient-measure">${item.measure}</span>
        </li>
      `;
    })
    .join("");

  detailContent.innerHTML = `
    <img class="detail-image" src="${meal.strMealThumb}" alt="${meal.strMeal}" width="400" height="300">
    <h3>${meal.strMeal}</h3>
    <p class="detail-tags">${meal.strCategory} &middot; ${meal.strArea}</p>
    <ul class="ingredient-list">${listHtml}</ul>
    <p class="detail-instructions">${meal.strInstructions}</p>
  `;

  detailSection.hidden = false;
  resultsSection.hidden = true;
  detailSection.scrollIntoView({ behavior: "smooth" });
}

function closeDetail() {
  detailSection.hidden = true;
  resultsSection.hidden = false;
}

detailClose.addEventListener("click", closeDetail);

// ---- init ----
cuisineStatusEl.textContent = "Add a few ingredients above to see cuisine recommendations.";