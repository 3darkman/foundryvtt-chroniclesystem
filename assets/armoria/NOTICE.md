# Armoria — Third-party notices (spec 014)

The embedded coat-of-arms renderer and its bundled charge artwork derive from
**[Armoria](https://github.com/Azgaar/Armoria)**, a procedural heraldry generator
and editor by **Azgaar / Maxim Ganiev**.

## Renderer code (ported)

The render math in `module/coat-of-arms/render/` — SVG assembly / z-order, the
`transform()`/`getElTransform()` positioning, the line/division/ordinary/pattern
generators, and the SVG→PNG rasteriser — is **ported from Armoria** and remains
faithful to the upstream (FR-018). Armoria is distributed under the **MIT License**
(© Azgaar / Maxim Ganiev, 2021).

> MIT License — <https://opensource.org/licenses/MIT>

The heraldic **geometry** (shield paths/positions, line paths, division/ordinary
templates, pattern generators, tincture render hues) is generated into
`module/coat-of-arms/data/armoria-catalog.js` from the Armoria sources by
`scripts/extract-armoria-catalog.mjs` (dev-only, offline).

## Charge artwork (bundled)

`assets/armoria/charges/*.svg` and the generated inline copies in
`module/coat-of-arms/data/armoria-charge-art.js`. Individual charges carry
different licenses — **the `<metadata source license>` of each SVG is
authoritative**; the families present are:

- **Simple, self-made shapes** — **CC0** (public domain dedication).
  <https://creativecommons.org/publicdomain/zero/1.0/>
- **Historical charges** (many from **[WappenWiki](http://wappenwiki.org)** /
  Wikimedia Commons) under Creative Commons **BY-SA 3.0/4.0**, **BY-NC 3.0**, or
  **BY-NC-SA 3.0** — see each charge's metadata for the exact terms and author.
  Charges under a **non-commercial (NC)** license may only be used
  non-commercially.

The originating `author`, `source` and `license` metadata is preserved on every
inlined charge `<g>` (renderer-pipeline invariant 4). Per-charge attribution comes
from the `<metadata>` element of each source SVG (mirrored in the `license` field
of `armoria-charge-art.js`).
