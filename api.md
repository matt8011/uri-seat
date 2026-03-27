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
- `DELETE /api/items/:id`
- `POST /api/items/import`

## Endpoints

### `GET /api/config`

Returns frontend configuration flags.

Example response:

```json
{
  "googleClientId": "...",
  "googleAuthEnabled": true,
  "adminEmailsConfigured": true
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
    "isAdmin": true
  }
}
```

### `GET /api/meta`

Returns the list of allowed food classifications.

Example response:

```json
{
  "classifications": [
    "Rice",
    "Tofu",
    "Cheese"
  ]
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

- `q`: search term matched against food name, tagged recipes, and food classification

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
  "food_classification": "Tofu"
}
```

Notes:

- `sustainability_index`, `nutrient_rich_food_index`, `nutrition_composite_score`, and `environmental_composite_score` exist in the schema but are not currently editable through the API payload
- those computed fields are stored as `null` for now

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
  "csvText": "name,tagged_recipes,protein,fiber,vitamin_a,vitamin_c,vitamin_e,calcium,iron,magnesium,potassium,saturated_fat,added_sugar,sodium,food_classification\nTofu Stir Fry,\"stir fry,vegan entree\",12.5,4.2,1.1,2.4,0.4,120,2.3,35,240,0.8,1.2,430,Tofu",
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
- `food_classification`

Accepted aliases:

- `food_item_name` for `name`
- `classification` for `food_classification`
- `recipe_tags` for `tagged_recipes`

## Current Food Entry Shape

Responses currently include:

```json
{
  "id": 1,
  "name": "Tofu Stir Fry",
  "sustainability_index": null,
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
  "nutrient_rich_food_index": null,
  "nutrition_composite_score": null,
  "food_classification": "Tofu",
  "environmental_composite_score": null
}
```
