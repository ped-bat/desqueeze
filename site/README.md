# Desqueeze - landing page

Static marketing site for desqueeze.io. No build step, no dependencies:
plain HTML, CSS and ES modules, deployed as-is.

```
site/
├── index.html            # the whole page
├── css/site.css          # tokens + components
├── js/
│   ├── dot-grid.js       # port of the app's DotGridEngine
│   └── site.js           # page wiring (hero intro, reveals, downloads, demo)
├── assets/
│   ├── fonts/science-gothic.woff2
│   ├── icons.svg         # platform and GitHub glyphs
│   ├── favicon.svg, logo.svg
│   └── og.png            # rendered by scripts/site/render-og.sh
├── robots.txt
└── sitemap.xml
```

## Preview locally

ES modules have to be served over HTTP; opening `index.html` from the
filesystem will not work.

```bash
cd site && python3 -m http.server 8000
# → http://localhost:8000
```

## Structure

The section order follows the Bind it landing page: hero with the
visitor's download first, features, how it works, common questions,
download, a support strip, then the footer. The content and the look are
the app's.

## Design notes

The page is the app's working surface stretched into a document, so it
borrows from the renderer rather than approximating it:

- **Tokens** in `css/site.css` are copied from
  `src/renderer/styles/global.css`: the same palette, white-opacity ramp,
  chrome, blur and radii. The only hues on the page belong to status
  (amber working, green done) and to the hero title's RGB split, exactly as
  in the app; the primary action is near-white on near-black.
- **The footer bar** is `dg-footer-bar`: 66px of chrome with a 2px blur and
  a rule that fades towards both ends, carrying the app's resting summary
  line. There is no top bar; the hero title is the wordmark.
- **The dot grid** (`js/dot-grid.js`) is a real port of the app's engine,
  with film grain and dot glow baked into tiles because per-frame
  generation is far too expensive across a full viewport. On the site it
  is fixed and centred, ignores the pointer, and runs the app's
  processing-stage stretch on its 3s loop (`loop: true`); it does not
  travel with the page. It is also knocked back (`config` in
  `js/site.js`: lower base and ceiling opacity, softer glow, a darker
  canvas ground, a slight CSS blur) so it stays a backdrop behind a page
  of text.
- **Before and after** (`.compare`, in the hero) is one photo rendered
  twice from the same ARW decode, as shot and stretched 1.33x
  (`assets/photo/`), split top over bottom. The split rides a spring
  towards the pointer, so it eases in on entry, follows the pointer up and
  down, and stays where it was left. The squeezed frame is narrower, so it
  sits centred with dark bands either side rather than being stretched to
  fit.
- **Type** is Science Gothic throughout. Uppercase is reserved for the
  wordmark and the hero title, as in the app; everything else is sentence
  case at the app's UI axes (`wght 450, wdth 92`). The hero title,
  "Desqueeze.io", rests at the app's display axes (`wght 520, wdth 125`)
  and desqueezes into them on load, on the app's text spring.
- **Motion** is one orchestrated moment on load plus crossfades; nothing
  slides. `prefers-reduced-motion` holds the grid still, skips the intro
  and shows the demo as a finished batch.

## Keeping content in sync

| Content       | Where it lives here                                                 | Source of truth                          |
| ------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| Format lists  | the "Which files" answer in `index.html`, twice (visible + JSON-LD) | the README's generated format list       |
| Camera count  | features + FAQ copy in `index.html`                                 | the README's generated camera count      |
| Download URLs | the three `.dl` links in `index.html`                               | `build.*.artifactName` in `package.json` |

The download links point at `releases/latest`, so a new release needs no
change here.

## OG image

`assets/og.png` is rendered from `scripts/site/og.html`:

```bash
scripts/site/render-og.sh
```

## Deploying

The directory deploys as-is. `.github/workflows/deploy-site.yml` syncs
`site/` over FTPS on every push to `main` that touches it, and needs these
repository settings:

- variables: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PORT`, `WEBSITE_URL`,
  `FTP_REMOTE_DIR`
- secret: `FTP_PASSWORD`

Any static host works instead: publish directory `site`, no build command.
