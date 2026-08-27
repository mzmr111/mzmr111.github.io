# Japan Places Map

Readable source for the Japan travel map. The app uses React, Vite and Leaflet.
The production build is deliberately **not minified**.

## Local development

```bash
npm install
npm run dev
```

## Build for GitHub Pages

```bash
npm install
npm run build
```

Vite creates `dist/`. Upload the **contents of `dist/`** to the
`japan-places-map/` directory of `mzmr111.github.io`.

The build already uses `/japan-places-map/` as its public base path. Generated
JavaScript and CSS remain readable because `build.minify` is disabled.

## Updating places

Replace `public/japan_places_map_data.json`, then run `npm run build` again.

## Main files

- `src/App.tsx` — map, filters, cards and place drawer.
- `src/styles.css` — all visual styles and responsive layout.
- `public/japan_places_map_data.json` — places and routes.
- `vite.config.ts` — GitHub Pages base path and unminified build settings.
