# Iftar Lantern

Iftar Lantern is a mobile-friendly Ramadan meal picker for:

- Main course
- Side dish
- Dessert

## No-repeat behavior

Each category has its own no-repeat pool:

- A selected main course will not repeat until all main courses are used.
- A selected side dish will not repeat until all side dishes are used.
- A selected dessert will not repeat until all desserts are used.

When a category pool is exhausted, it automatically reshuffles and starts a new cycle.

## Features

- Add and remove dishes per category
- Persist dishes and history locally (`localStorage`)
- Generate randomized meal combos
- Reset all no-repeat pools manually
- Copy the latest combo text
- Installable on iPhone home screen with offline support

## Run locally

Open `index.html` in a browser.

## Auto deploy to GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml` and deploys automatically on each push to `main`.

1. Go to repo settings -> Pages.
2. Set **Source** to `GitHub Actions`.
3. Push to `main`.
4. Wait for the `Deploy Pages` workflow to finish.
5. Open your Pages URL.

## iPhone install

1. Open your Pages URL in Safari.
2. Tap `Share -> Add to Home Screen`.
3. Open once while online to seed the cache.
4. After that, core app files load offline.
