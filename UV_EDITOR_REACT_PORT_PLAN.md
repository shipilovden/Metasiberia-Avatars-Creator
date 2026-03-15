# UV Editor React Port Plan

## Goal

Safely integrate `uv-editor-extracted` into the React avatar creator without replacing the current working UV editor or the Ready Player Me export pipeline.

## Constraints

- Keep the current `src/components/UvDecalEditor.tsx` as the default implementation until the port is proven.
- Do not adopt the extracted `GLTFExporter` save flow as-is.
- Do not depend on VS Code webview bridges, Pug templates, or SCSS-only tooling.
- Keep the port behind a feature flag while the transfer is in progress.

## Stages

1. Foundation
   - Add a branch-local React bridge that can switch between the legacy editor and the new port.
   - Introduce a typed document model that mirrors the extracted editor concepts:
     base layer, decal layers, draft layer, active tool, paint target, crop shape.
   - Render a React scaffold with extracted-style layout and current live data.

2. Preview parity
   - Move mesh loading, UV wireframe drawing, viewport pan/zoom, and layer preview into the new module.
   - Keep `onApply`, `onReset`, `onClearApplied`, slot switching, and draft UV updates wired to the existing app state.

3. Layer operations
   - Port layer selection, visibility, locking, rename, duplicate, and ordering.
   - Replace the current flat applied decal list editing flow with the typed layer model.

4. Paint and crop tools
   - Port brush, eraser, eyedropper, crop box, and mask canvases.
   - Keep all paint work in browser memory and continue baking through the existing preview/export texture pipeline.

5. Persistence and export adaptation
   - Replace VS Code bridge persistence with app-local React state serialization if needed.
   - Adapt export to the existing Ready Player Me post-process instead of scene-level GLTF export.

6. Cutover
   - Validate parity on top/bottom/footwear/headwear/facewear slots.
   - Flip the feature flag only after preview and export match the legacy path.
   - Remove the legacy editor only after the new module has full coverage.

## Validation gates

- `yarn build` passes after each stage.
- Preview still matches the current editor when the feature flag is off.
- Export path still goes through the Ready Player Me post-process.
- User asset changes outside the UV port stay untouched.
