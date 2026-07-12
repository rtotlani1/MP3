// ---- state ----
let pantry = [];
const detailCache = new Map(); // idMeal -> full meal object, filled in as we fetch details

const MAX_ENRICHED_RESULTS = 12; // how many top matches get full ingredient detail

// ---- DOM refs ----
const pantryForm = document.getElementById("pantry-form");
const ingredientInput = document.getElementById("ingredient-input");
const pantryListEl = document.getElementById("pantry-list");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const resultsSection = document.getElementById("results-section");
const detailSection = document.getElementById("detail-section");
const detailContent = document.getElementById("detail-content");
const detailClose = document.getElementById("detail-close");

// ---- helpers ----

// TheMealDB stores ingredients as strIngredient1..20 / strMeasure1..20.
// Loop through and stop at the first empty slot.
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
  searchRecipes();
}

function removeIngredient(ingredient) {
  pantry = pantry.filter((p) => p !== ingredient);
  renderPantry();
  searchRecipes();
}

pantryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addIngredient(ingredientInput.value);
  ingredientInput.value = "";
  ingredientInput.focus();
});

// ---- search + ranking ----

async function searchRecipes() {
  closeDetail();

  if (pantry.length === 0) {
    resultsEl.innerHTML = "";
    statusEl.textContent = "Add a few ingredients above to see what you can cook.";
    return;
  }

  statusEl.textContent = "Looking for recipes...";
  resultsEl.innerHTML = "";

  try {
    // One filter.php call per pantry ingredient, in parallel.
    const resultsByIngredient = await Promise.all(
      pantry.map((ingredient) => fetchMealsByIngredient(ingredient))
    );

    // Count how many pantry ingredients each meal shows up under.
    const matchMap = new Map();
    resultsByIngredient.forEach((meals) => {
      if (!meals) return;
      meals.forEach((meal) => {
        const existing = matchMap.get(meal.idMeal);
        if (existing) {
          existing.count += 1;
        } else {
          matchMap.set(meal.idMeal, {
            idMeal: meal.idMeal,
            strMeal: meal.strMeal,
            strMealThumb: meal.strMealThumb,
            count: 1,
          });
        }
      });
    });

    if (matchMap.size === 0) {
      statusEl.textContent = "No recipes found for that combination. Try different ingredients.";
      return;
    }

    const ranked = Array.from(matchMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.strMeal.localeCompare(b.strMeal);
    });

    const topMatches = ranked.slice(0, MAX_ENRICHED_RESULTS);

    statusEl.textContent =
      `${ranked.length} recipe${ranked.length === 1 ? "" : "s"} found, sorted by best match` +
      (ranked.length > MAX_ENRICHED_RESULTS ? ` (showing top ${MAX_ENRICHED_RESULTS}).` : ".");

    // Fetch full ingredient lists for the visible matches so we can show what's missing.
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
      <img src="${match.strMealThumb}/small" alt="${match.strMeal}">
      <div class="recipe-info">
        <p class="recipe-name">${match.strMeal}</p>
        <p class="recipe-match">${match.count} of ${pantry.length} ingredients matched</p>
      </div>
    `;
    card.addEventListener("click", () => openDetail(match.idMeal));
    resultsEl.appendChild(card);
  });
}

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
    <img class="detail-image" src="${meal.strMealThumb}" alt="${meal.strMeal}">
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
statusEl.textContent = "Add a few ingredients above to see what you can cook.";