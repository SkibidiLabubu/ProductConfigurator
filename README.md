# Shopify Embedded Product Configurator (Vite + React + TypeScript)

A lightweight, front-end only configurator that resolves photorealistic WebP renders by deterministic paths and posts the
selection to Shopify via AJAX cart properties. The UI adapts to whatever asset combinations exist on the CDN, hiding
unavailable options automatically.

## Project layout
- **src/** React + TypeScript source
  - `components/Configurator.tsx` – main UI and Shopify cart handler
  - `utils/assetResolver.ts` – deterministic URL resolver plus availability probing with HEAD requests
  - `utils/preload.ts` – preload helper for beauty/thumbnail assets
  - `config.ts` – configurable constants (CDN root, default options, variant id)
- **public/renders/** – dev test set (bases 01/05/10, shades 01/10/20, cameras 01–03, on-state only)
- **renders/** – same dataset at repository root for reference

## Running locally
1. Install dependencies (requires npm registry access):
   ```bash
   npm install
   ```
2. Start Vite dev server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```

`CDN_ROOT` defaults to `/renders`, which works against the dev assets included in `public/renders`. Point it to your CDN base
URL for production.

## Embedding in Shopify
- Build the app and host the `dist` bundle on your CDN or within the Shopify theme assets.
- Inject the compiled script on the product page (theme app block or script tag) and render into a container element:
  ```html
  <div id="configurator-root"></div>
  <script type="module" src="https://cdn.example.com/configurator/entry.js"></script>
  ```
- The configurator posts a single variant (`VARIANT_ID` in `src/config.ts`) to `/cart/add.js` with line item properties:
  - Base, Shade, Camera, State
  - PreviewUrl (beauty.webp path)
  - ConfiguratorVersion (defaults to `v1`)

## Availability probing
`assetResolver.buildAvailabilityMap` runs HEAD requests for `beauty.webp` and `beauty_512.webp` across configured bases,
shades, cameras, and states. Results are cached in-memory to avoid duplicate requests. The UI is seeded with a static
manifest (dev dataset) and refreshes when probing completes.

## Notes
- Logic is ready for full datasets (bases 01–38, shades 01–42, cameras 01–03, on/off). The UI only surfaces combinations
  that respond positively to probes.
- Optional passes (ao, normal, emission) are mapped but not required by the UI yet.
