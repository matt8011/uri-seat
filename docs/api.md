# API.md

## Overview

This document describes the current API for the Sustainable Eating Assessment Tool.

Base URL in local development:

`http://localhost:3000`

## Authentication

Google sign-in is initiated from the frontend and completed by posting the Google credential to the backend.

Authenticated admin sessions are stored in a signed cookie.

Admin-only endpoints:

- `POST /api/items`
- `PUT /api/items/:id`
- `POST /api/items/import`

Super-admin-only endpoints:

- `DELETE /api/items/:id`
- `DELETE /api/recipes/:id`
- `POST /api/admin/clear-database`
- `POST /api/admin/clear-ingredients`
- `POST /api/admin/clear-recipes`

## Endpoints

### `GET /api/config`

Returns frontend configuration flags.

Example response:

```json
{
  "googleClientId": "...",
  "googleAuthEnabled": true,
  "adminEmailsConfigured": true,
  "superAdminEmailsConfigured": true
}
```

### `GET /api/session`

Returns the current signed-in user, if any.

Example response:

```json
{
  "user": {
    "id": 1,
    "email": "admin@example.edu",
    "name": "Admin User",
    "picture": "https://...",
    "isAdmin": true,
    "isSuperAdmin": true
  }
}
```

### `POST /api/auth/google`

Completes Google sign-in.

Request body:

```json
{
  "credential": "google-id-token"
}
```

### `POST /api/auth/logout`

Clears the current session cookie.

### `GET /api/items`

Returns up to 200 food entries.

Optional query string:

- `q`: search term matched against food name and tagged recipes

Example:

`GET /api/items?q=salad`

### `GET /api/items/:id`

Returns a single food entry by id.

### `POST /api/items`

Creates a food entry.

Admin only.

Request body:

```json
{
  "name": "Tofu Stir Fry",
  "tagged_recipes": ["stir fry", "vegan entree"],
  "protein": 12.5,
  "fiber": 4.2,
  "vitamin_a": 1.1,
  "vitamin_c": 2.4,
  "vitamin_e": 0.4,
  "calcium": 120,
  "iron": 2.3,
  "magnesium": 35,
  "potassium": 240,
  "saturated_fat": 0.8,
  "added_sugar": 1.2,
  "sodium": 430,
  "freshwater_withdrawals": 149,
  "stress_weighted_water_use": 5113,
  "acidifying_emissions": 6.7,
  "eutrophying_emissions": 6.2,
  "ghg_emissions": 3.2,
  "land_use": 3.5
}
```

Notes:

- `nutrient_rich_food_index` and `nutrition_composite_score` are calculated automatically by the server
- the environmental side now stores raw user-entered measurements instead of using a static classification lookup
- `environmental_composite_score` is calculated automatically by scoring each environmental factor from `1` to `5` using threshold cutoffs, then averaging the six scores
- `water_use_score`, `nitrogen_use_score`, `carbon_use_score`, and `land_use_score` are calculated automatically from those same environmental factor scores
- `sustainability_index` is calculated automatically as `nutrition_composite_score + environmental_composite_score`
- `tagged_recipes` is now optional metadata; recipe scoring can come from the dedicated recipe portions import instead

### `PUT /api/items/:id`

Updates a food entry.

Admin only.

Uses the same JSON shape as `POST /api/items`.

### `DELETE /api/items/:id`

Deletes a food entry.

Admin only.

### `POST /api/items/import`

Imports food entries from CSV.

Admin only.

Supported request styles:

1. `application/json`

```json
{
  "csvText": "name,tagged_recipes,protein,fiber,vitamin_a,vitamin_c,vitamin_e,calcium,iron,magnesium,potassium,saturated_fat,added_sugar,sodium,freshwater_withdrawals,stress_weighted_water_use,acidifying_emissions,eutrophying_emissions,ghg_emissions,land_use\nTofu Stir Fry,\"stir fry,vegan entree\",12.5,4.2,1.1,2.4,0.4,120,2.3,35,240,0.8,1.2,430,149,5113,6.7,6.2,3.2,3.5",
  "replaceExisting": true
}
```

2. Raw `text/csv`

Send the CSV body directly. If you want to replace all existing entries in this mode, include header:

`X-Replace-Existing: true`

### CSV Headers

Expected CSV headers:

- `name`
- `tagged_recipes`
- `protein`
- `fiber`
- `vitamin_a`
- `vitamin_c`
- `vitamin_e`
- `calcium`
- `iron`
- `magnesium`
- `potassium`
- `saturated_fat`
- `added_sugar`
- `sodium`
- `freshwater_withdrawals`
- `stress_weighted_water_use`
- `acidifying_emissions`
- `eutrophying_emissions`
- `ghg_emissions`
- `land_use`

Accepted aliases:

- `food_item_name` for `name`
- `recipe_tags` for `tagged_recipes`

### `POST /api/recipes/import`

Imports recipe portion rows from CSV.

Admin only.

Supported request styles:

1. `application/json`

```json
{
  "csvText": "recipe_name,ingredient_name,grams_in_portion\nChicken Salad,Mayonnaise,8.9625",
  "replaceExisting": true
}
```

2. Raw `text/csv`

Send the CSV body directly. If you want to replace all existing recipe rows in this mode, include header:

`X-Replace-Existing: true`

Expected CSV headers:

- `recipe_name`
- `ingredient_name`
- `grams_in_portion`

For each imported row, the app calculates the ingredient's recipe contribution as:

`(per_100g_metric * grams_in_portion) / 100`

When recipe portion rows exist, `POST /api/recipes/repopulate` rebuilds recipe totals and scores from those weighted ingredient contributions instead of using the older ingredient-tag averaging model.

## Current Food Entry Shape

Nutrition calculations currently use:

`((protein/50) + (fiber/25) + (vitamin_a/5000) + (vitamin_c/60) + (vitamin_e/30) + (calcium/1000) + (iron/18) + (magnesium/400) + (potassium/3500) - (saturated_fat/20) - (added_sugar/50) - (sodium/2400)) * 100`

The Nutrition Composite Score is then assigned from the Nutrient Rich Food Index:

- `1` when `ind <= 4.1`
- `2` when `4.1 < ind <= 10.6`
- `3` when `10.6 < ind <= 18.2`
- `4` when `18.2 < ind <= 30.5`
- `5` when `ind > 30.5`

The environmental system now stores these user-entered raw measurements directly:

- `freshwater_withdrawals`
- `stress_weighted_water_use`
- `acidifying_emissions`
- `eutrophying_emissions`
- `ghg_emissions`
- `land_use`

The Environmental Composite Score is calculated by:

1. Converting each environmental input into a score from `1` to `5`
2. Summing those six scores
3. Dividing by `6`

Environmental factor scoring thresholds:

- `freshwater_withdrawals`: `1` if `> 549.9`, `2` if `> 377.1`, `3` if `> 263.7`, `4` if `> 161.4`, else `5`
- `stress_weighted_water_use`: `1` if `> 18475`, `2` if `> 12806`, `3` if `> 9079`, `4` if `> 5601`, else `5`
- `acidifying_emissions`: `1` if `> 34.4`, `2` if `> 22.6`, `3` if `> 15.4`, `4` if `> 9.3`, else `5`
- `eutrophying_emissions`: `1` if `> 28`, `2` if `> 16.3`, `3` if `> 10.2`, `4` if `> 6.1`, else `5`
- `ghg_emissions`: `1` if `> 5.8`, `2` if `> 3.4`, `3` if `> 2.2`, `4` if `> 1.4`, else `5`
- `land_use`: `1` if `> 13`, `2` if `> 5.9`, `3` if `> 3.7`, `4` if `> 2.1`, else `5`

Derived environmental sub-scores:

- `water_use_score = (score_2_1 + score_2_2) / 2`
- `nitrogen_use_score = (score_2_3 + score_2_4) / 2`
- `carbon_use_score = score_2_5`
- `land_use_score = score_2_6`

Responses currently include:

```json
{
  "id": 1,
  "name": "Tofu Stir Fry",
  "sustainability_index": 9.3333,
  "tagged_recipes": ["stir fry", "vegan entree"],
  "created_at": "2026-03-27T12:00:00.000Z",
  "updated_at": "2026-03-27T12:00:00.000Z",
  "protein": 12.5,
  "fiber": 4.2,
  "vitamin_a": 1.1,
  "vitamin_c": 2.4,
  "vitamin_e": 0.4,
  "calcium": 120,
  "iron": 2.3,
  "magnesium": 35,
  "potassium": 240,
  "saturated_fat": 0.8,
  "added_sugar": 1.2,
  "sodium": 430,
  "nutrient_rich_food_index": 53.12,
  "nutrition_composite_score": 5,
  "freshwater_withdrawals": 149,
  "stress_weighted_water_use": 5113,
  "acidifying_emissions": 6.7,
  "eutrophying_emissions": 6.2,
  "ghg_emissions": 3.2,
  "land_use": 3.5,
  "environmental_composite_score": 4.3333,
  "water_use_score": 5,
  "nitrogen_use_score": 4.5,
  "carbon_use_score": 3,
  "land_use_score": 4
}
```
