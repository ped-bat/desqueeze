# Desqueeze — landing page

Static marketing site for Desqueeze. No build step, no dependencies: plain
HTML, CSS and ES modules.

```
site/
├── index.html            # the whole page
├── css/site.css          # tokens + layout
├── js/
│   ├── dot-grid.js       # port of the app's DotGridEngine
│   └── site.js           # page wiring (hero, demo, reveals, downloads)
└── assets/
    ├── fonts/science-gothic.woff2
    ├── favicon.svg
    └── logo.svg
```

## Preview locally

Because it uses ES modules it has to be served over HTTP — opening
`index.html` from the filesystem will not work.

```bash
cd site && python3 -m http.server 8000
# → http://localhost:8000
```

## Deploying

The directory is deploy-as-is. Point any static host at it:

- **GitHub Pages** — either move the contents to `docs/` and set Pages to
  "deploy from branch → /docs", or add a Pages action that uploads `site/`
  as the artifact.
- **Netlify / Vercel / Cloudflare Pages** — publish directory `site`, no
  build command.

Set the custom domain in the host's settings. The canonical URL in
`index.html` and the `og:url` meta tag both point at `https://desqueeze.io/`
— change them if the domain differs.

## Design notes

The site deliberately shares the app's visual language rather than
approximating it:

- **Tokens** in `css/site.css` are copied from
  `src/renderer/styles/global.css` — same palette, same white-opacity ramp,
  same glass and glow effects, same 4px radius.
- **The dot grid** (`js/dot-grid.js`) is a real port of
  `src/renderer/engine/DotGridEngine.js`, keeping the cursor magnetism, the
  spotlight gradient, the chromatic aberration and the stretch spring with
  the app's own tuning constants. It drops the five-mode state machine and
  bakes the film grain and dot glow into reusable tiles/sprites — the app
  regenerates both per frame, which is fine in a 1120×720 window and far too
  expensive across a full browser viewport.
- **The wordmark is the app's title**, animating from a narrow optical width
  into its exact rest state, RGB layer split included. Worth knowing if you
  ever touch it: `dg-chroma-text` *declares* `font-weight: 600` and
  `letter-spacing: 0.1em`, but `DotGridEngine.applyFrame()` overwrites both
  inline every frame, and `font-variation-settings` beats `font-weight`. What
  actually renders at rest is `wght 300`, `wdth 80`, `scaleX(1.5)` and 8px of
  tracking — which is what the site matches. The tracking is expressed in `em`
  here (`0.174em` = the app's 8px at its 2.88rem cap) so it holds at hero size.
- **Type** is Science Gothic throughout. Headings, labels and buttons keep
  the app's uppercase and wide tracking; running prose drops to sentence
  case at a wider optical width, because all-caps paragraphs are not
  readable at landing-page length.

## Keeping content in sync

Three things are hardcoded here and maintained elsewhere in the repo:

| Content | Where it lives here | Source of truth |
| --- | --- | --- |
| RAW / bitmap format chips | `RAW_FORMATS` / `BITMAP_FORMATS` in `js/site.js` | the README's generated format list |
| Version badge | `.version` in `index.html` | `version` in `package.json` |
| Download URLs | the three `.dl` links in `index.html` | `build.*.artifactName` in `package.json` |

The camera list is **not** duplicated — the Coverage section links straight
to `resources/cameras.json` on GitHub, so it can never go stale.

Bump the version badge when you cut a release; the download links themselves
point at `releases/latest` and need no change.
