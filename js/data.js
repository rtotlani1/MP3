// All TheMealDB API calls live in this file.
// main.js calls these functions — it never calls fetch() directly.

const BASE_URL = "https://www.themealdb.com/api/json/v1/1";

// Filter meals by a single ingredient.
// Returns an array of { idMeal, strMeal, strMealThumb } or null if no matches.
async function fetchMealsByIngredient(ingredient) {
  const url = `${BASE_URL}/filter.php?i=${encodeURIComponent(ingredient)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`filter.php failed: ${response.status}`);
  const data = await response.json();
  return data.meals;
}

// Look up the full recipe (ingredients, measures, instructions) by id.
async function fetchMealDetails(id) {
  const url = `${BASE_URL}/lookup.php?i=${encodeURIComponent(id)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`lookup.php failed: ${response.status}`);
  const data = await response.json();
  return data.meals ? data.meals[0] : null;
}
