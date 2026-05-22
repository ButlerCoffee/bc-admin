# Butler Coffee Admin — Vite React

This is the Butler Coffee admin database converted from a single HTML file into a Vite + React app.

## Run locally

```bash
npm install
npm run dev
```

## Configure the Google Apps Script URL

Create `.env.local` and add:

```bash
VITE_BUTLER_COFFEE_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

If you do not set this, the app uses the existing Apps Script URL from the original admin page.

## Build

```bash
npm run build
```

Deploy the generated `dist/` folder to Netlify, Vercel, or your static host.
