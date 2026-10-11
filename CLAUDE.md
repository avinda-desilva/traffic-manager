# Traffic Manager

A browser physics game drawn in the style of the Anatomy skill (`/anatomy`, installed by `.claude/hooks/session-start.sh` in cloud sessions). Read the skill's craft rules before changing how anything looks.

- `npm test` runs the model tests; `npm run build` regenerates both pages in `game/`. Rebuild and commit the pages after any change under `src/` or `build.mjs`.
- `src/model.mjs` is the only source of truth for numbers shown on the board (readout, caption, legend). It must stay free of DOM code: the page inlines it.
- Modules are inlined into the page as objects (`k`, `G`, `M`, `PARTS`, `SCENE`) by `build.mjs`; use namespace imports (`import * as X`) between them, except for the vendored kit's own imports.
- Don't edit `vendor/anatomy/`; it is a pinned copy of the skill's kit.
