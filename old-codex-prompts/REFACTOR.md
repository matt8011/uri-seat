# REFACTOR.md

## How To Use This File

Fill out the sections below with as much specificity as you can.

Once you are done, tell the agent:

`Execute the refactor described in REFACTOR.md`

The agent should treat this file as the primary implementation brief.

If a section is intentionally undecided, mark it as `TBD` rather than leaving it blank.

## Project

- Project name: Sustainable Eating Assessment Tool
- Owner / stakeholders: URI Nutrition Department
- Date: 27 March 2026

## Refactor Goal

Describe the end state you want.

Answer:

- We want the landing page to be the only one visible to unregistered users.
- We want the admin login/database management system to be a separate page hidden away
  from the user. 
- We want to retain the Google Auth process.
- We want to retain the `start.sh` script as the major way to start the server.
- Eventually we'd like this app to be publishable on Railway with ease. This is
  something to keep in mind.
- We want to do a major overhaul to the database and database entry system.
  Specifically:
    - We should have 3 categories for the admin to fill out when they are entering an item:
    - General Food Details
        - <String> Food item name
        - <Float> Sustainability Index. The user should not be able to set this
          value. We will add it to the database schema for now. Later, we will create a function to calculate this.
        - <String of Comma-Separated Values> Tagged Recipes
        - <Date> Created
        - <Date> Last Updated
    - Nutrition Details
        - <Float> Protein
        - <Float> Fiber
        - <Float> Vitamin A
        - <Float> Vitamin C
        - <Float> Vitamin E
        - <Float> Calcium
        - <Float> Iron
        - <Float> Magnesium
        - <Float> Potassium
        - <Float> Saturated Fat
        - <Float> Added Sugar
        - <Float> Sodium
        - <Float> Nutrient Rich Food Index. The user should not be able to set
          this value. We will instead calculate it using a function later. For now, it will suffice to add it to the database schema
        - <Float> Nutrition Composite Score. The user should not be able to set
          this value. We will calculate it using a function later. For now, it will suffice to add it to the database schema.
    - Environmental Details
        - <String> Food Classification. This should be a combo box that the
          user can select from a list of predetermined options. The options are listed below:
            - Wheat & Rye (Bread)
            - Maize (Meal)
            - Barley (Beer)
            - Oatmeal
            - Rice
            - Potatoes
            - Cassava
            - Cane Sugar
            - Beet Sugar
            - Other Pulses
            - Peas
            - Nuts
            - Groundnuts
            - Soymilk
            - Tofu
            - Soybean Oil
            - Rapeseed Oil
            - Olive Oil
            - Tomatoes
            - Onions & Leeks
            - Root Vegetables
            - Brassicas
            - Other Vegetables
            - Citrus Fruit
            - Bananas
            - Apples
            - Berries & Grapes
            - Wine
            - Other Fruit
            - Coffee
            - Dark Chocolate
            - Bovine Meat (beef herd)
            - Bovine Meat (dairy herd)
            - Lamb & Mutton
            - Pig Meat
            - Poultry Meat
            - Milk
            - Cheese
            - Eggs
            - Fish (farmed)
            - Crustaceans (farmed)
        - <Float> Environmental Composite Score. The user should not be able to set
          this value. It will be calculated by a function we will add later. It should exist in the database schema for the time being.
- Users should only see the food item name, sustainability index, nutrition
  composite score, environmental composite score, and tagged recipes.


## Why We Are Refactoring

Describe the main pain points in the current codebase.

The monolithic web app is a bit busy with having the database administration system integrated into the front page.
We'd like to hide this away from the user and keep it as simple as possible for them.
Also, we've narrowed down the data we will use to build composite scores for different categories, which contribute to the overall Sustainability Index score.


## Target Architecture

Describe the desired architecture after the refactor.

The current architecture we are using seems good. However, if better ideas to ease Railway deployment later pop up, I am not opposed to hearing about them.
We'd like to keep it as minimal and lightweight as possible.

## What Must Be Preserved

List behaviors that cannot break.

Search should keep working.
Google Auth should continue to work.
The `start.sh` script should be preserved and be the primary way to run the app.


## What Is Allowed To Change

List anything the refactor may change intentionally.

- Visual redesign is allowed. It is expected there will be visual changes with
  database management becoming its own separate page.
- The database may be completely wiped out. This is expected since we are going
  to be changing the schema quite a bit.

## What Is Out Of Scope

List changes we should explicitly avoid during this refactor.

- Do not attempt to commit/push/pull. Any version control should be done by the
  software engineer.

## Refactor Priorities In Order

Put these in strict priority order if possible.

1. Database schema modification to match spec.
2. Separation of search feature and database administration.

## Delivery Strategy

Choose how the refactor should be executed.

- Incremental build focusing on refactor priorities in order.

## Risk Tolerance

Clarify how aggressive the refactor can be.

- You can wipe out the database for modifying the schema
- Make sure the code is still readable
- Prioritize getting something working

## Required Deliverables

List the concrete outputs you expect.

- New database schema
- Home page retains searching feature
- Separate page for admin login/database administration

## Desired Folder Structure

Try to fit into the current folder structure

## API Compatibility

- Redesign the API such that we could upload a .csv file to bulk populate the
  database. The CSV file would contain similar fields as to what the admin would enter on the site.



## Data Compatibility

State how existing data should be handled.

Answer:

- You can wipe out the existing database for this assignment


## Auth Expectations

Describe the auth rules that must hold after refactor.

Answer:

- Preserve current authorization and login strategy. 

## Testing Expectations

Describe the test depth you want.

Answer:

- Testing is not a priority at this time. 

## Documentation Expectations

List docs that should be created or updated.

Examples:

- Generate `api.md` which describes how to hit the API and upload data to
  populate the database.

## Constraints

Document any hard constraints.

Answer:

- Consider that we would like this to be a simple Railway deployment in the
  future
- Avoid overloading on dependencies and straying away from the current stack

## Open Questions

List anything still uncertain.

Answer:

- I'm not sure how we will get this on Railway later, but it is a priority to
  keep in mind.

## Agent Instructions

Add any direct instructions for the coding agent here.

- Implement in phases

## Final Approval Rule

Choose how the agent should proceed once this file is filled out.

Examples:

- execute everything end-to-end without further confirmation
- propose a phased plan first, then wait for approval
- implement only phase 1 first

Answer:

- Propose phases then proceed once all are confirmed
