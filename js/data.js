// All TheMealDB API calls live in this file.
// main.js calls these functions — it never calls fetch() directly.

const BASE_URL = "https://www.themealdb.com/api/json/v1/1";

// Filter meals by a single ingredient.
// Returns an array of { idMeal, strMeal, strMealThumb } or null if no matches.
async function fetchMealsByIngredient(ingredient) {
  const url = `${BASE_URL}/filter.php?i=${encodeURIComponent(ingredient)}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.meals;
}