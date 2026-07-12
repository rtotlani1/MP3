What I'm building: 
A "what can I cook with what I have" app — you enter the ingredients sitting in your kitchen, and it finds TheMealDB recipes that use as many of them as possible, showing you what's missing for each match.

Which API I'm using: 
TheMealDB (themealdb.com/api.php) — using filter.php?i= (filter by single ingredient), lookup.php?i= (full recipe detail), and list.php?i=list (valid ingredient list for the picker).

Why I chose this: 
It's more than just displaying API data back to the user — I have to actually solve a problem (matching across multiple filtered result sets) instead of just rendering a response. It's also a genuinely useful tool, not just a browsing app.

Core features:

- Ingredient picker pulled from list.php?i=list, so users can only add ingredients that actually exist in the database (autocomplete-style search box)
- Build a "pantry" of 2-5 selected ingredients
- Fetch filter.php?i= separately for each ingredient, then intersect the result sets client-side to find recipes matching all of them
- If nothing matches all ingredients, fall back to ranking recipes by how many of the pantry ingredients they use (best partial match first)
- Recipe detail view showing the full ingredient list with what you have vs. what you still need to buy, highlighted differently

What I don't know yet: 
How to efficiently intersect multiple arrays of meal IDs from separate API calls without it getting messy. Also unsure how to parse out the "missing ingredients" comparison cleanly, since lookup.php returns ingredients as 20 separate numbered fields (strIngredient1, strIngredient2, etc.)