# RaMEALSdan

A mobile-friendly web app to help you pick a Ramadan meal combo:

- Main course
- Side dish
- Dessert

You can add your own dishes and generate randomized combinations without repetition until all combos are used.

## Features

- Add and remove dishes per category
- Save dishes locally on your device (`localStorage`)
- Generate random combos with no repeats in a cycle
- See how many combos are left
- Reset cycle when all combos are used
- Copy the latest combo text

## Run locally

1. Open `index.html` in your browser.
2. Use the app.

## Use on your phone

### Option 1: GitHub Pages (recommended)

1. Push this repo to GitHub.
2. In GitHub repo settings, enable Pages:
   - Source: `Deploy from a branch`
   - Branch: `main` (root)
3. Open your Pages URL on your phone (Safari).
4. Tap `Share -> Add to Home Screen`.
5. Open the installed app once while online to cache files for offline use.

### Option 2: Local network during development

Run a local static server in this folder and open the LAN URL on your phone.

Example:

```bash
python3 -m http.server 8080
```

Then open `http://<your-computer-ip>:8080`.

## Offline/PWA notes

- Includes a web app manifest.
- Includes a service worker cache for app shell files.
- Includes iPhone home-screen icon/meta tags.
- After first successful load, core app files work offline.
- Your dish data is still stored locally per device/browser via `localStorage`.
