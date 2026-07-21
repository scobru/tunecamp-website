## 2024-05-24 - Empty State Recovery
**Learning:** The zero-result empty state during search/filtering lacked a recovery path, making it tedious for users to manually reset multiple inputs (search, artist, genre).
**Action:** Always include an actionable "Clear Filters" button in empty states that programmatically resets all relevant input values and re-triggers the list render.
