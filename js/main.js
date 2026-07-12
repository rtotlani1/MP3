const resultsEl = document.getElementById("results");

async function init() {
  // Hard-coded for Iteration 1. Iteration 2 replaces this with
  // whatever the user picks from the ingredient list.
  const ingredient = "chicken";

  const meals = await fetchMealsByIngredient(ingredient);

  // Look at this in the console to understand the JSON shape TheMealDB gives back.
  console.log(meals);

  if (!meals) {
    resultsEl.textContent = "No meals found for that ingredient.";
    return;
  }

  const firstFive = meals.slice(0, 5);

  firstFive.forEach((meal) => {
    const card = document.createElement("div");
    card.className = "meal-card";
    card.innerHTML = `
      <img src="${meal.strMealThumb}" alt="${meal.strMeal}">
      <p>${meal.strMeal}</p>
    `;
    resultsEl.appendChild(card);
  });
}

init();