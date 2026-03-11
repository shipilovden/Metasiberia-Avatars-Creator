# Metasibir Avatar Creator - AGENTS.md

## Purpose
- This project is a standalone local avatar creator built on top of downloaded Ready Player Me assets.
- The UI does not try to clone the original RPM editor. We keep our own flow and our own scene composition logic.

## Current Dataset
- Source app: `demo`
- Source app id: `6421563c21169e32c89017a0`
- Supported types: `top`, `bottom`, `footwear`, `outfit`, `hair`, `eye`, `glasses`, `headwear`, `beard`, `facewear`
- Source filters now include:
  - `bodyType = generic + fullbody`
  - `gender = male + female + neutral`
- Raw source catalog lives in [src/data/assets-catalog.json](./src/data/assets-catalog.json)
- Current catalog snapshot totals:
  - total unique assets: `547`
  - male library: `441`
  - female library: `446`

## Local Asset Pipeline
- `yarn assets:sync-catalog`
  - Runs `scripts/sync-asset-catalog.mjs`
  - Pulls the source asset catalog from Ready Player Me and writes `src/data/assets-catalog.json`
- `yarn assets:download`
  - Runs `scripts/download-local-library.mjs`
  - Downloads gender-specific base presets and local asset GLBs/icons
  - Writes `src/data/generated/local-library-manifest.json`
- `yarn assets:build`
  - Runs `scripts/build-assets-manifest.mjs`
  - Rebuilds generated type/group manifests and `src/data/generated/local-asset-capabilities.json`

## Storage Layout
- Gender-specific base presets:
  - `public/local-assets/base/male/preset-*.glb`
  - `public/local-assets/base/female/preset-*.glb`
- Preset previews:
  - `public/local-assets/presets/male/preset-*.png`
  - `public/local-assets/presets/female/preset-*.png`
- Gender-specific asset GLBs:
  - `public/local-assets/glb/male/<type>/<id>.glb`
  - `public/local-assets/glb/female/<type>/<id>.glb`
- Shared icons:
  - `public/local-assets/icons/<type>/<id>.<ext>`

## Runtime Rules
- The app keeps its own local composition flow in [src/App.tsx](./src/App.tsx).
- Gender selection switches the active local library and the available base presets.
- The "body" choice in this project is implemented as a curated base preset switch, not as a direct RPM `bodyShape` asset pipeline.
- On gender switch, incompatible selected assets are cleared.
- On preset switch, `beard` and `facewear` are reset to avoid head-slot conflicts between different base meshes.

## Verification Status
- Checked on `2026-03-11`.
- `src/data/generated/local-library-manifest.json` resolves to real files for both libraries:
  - male: `441` assets, `0` missing GLB, `0` missing icon, `4` presets, `0` missing base, `0` missing preview
  - female: `446` assets, `0` missing GLB, `0` missing icon, `4` presets, `0` missing base, `0` missing preview
- Production build passes with `yarn build`.
- Current remaining warning is Vite's large bundle warning only.

## Important Constraint
- Do not revert back to the old single-base setup.
- If the asset catalog is refreshed, regenerate all three stages in order:
  1. `yarn assets:sync-catalog`
  2. `yarn assets:download`
  3. `yarn assets:build`
