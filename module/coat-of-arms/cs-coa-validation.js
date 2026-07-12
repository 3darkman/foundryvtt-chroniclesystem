// Pure COA validation (FR-012/FR-009). Every enum is checked against the SSOT
// catalog allowlist before a COA is rendered/saved, so an invalid value never
// reaches the renderer. Domain layer — no DOM, no Foundry. Errors are returned as
// localisable descriptors ({ key, data }). The legacy URL-length budget() is gone
// (FR-014): there is no GET-URL ceiling for the embedded renderer.

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SEMY_PREFIX = "semy_of_";

/** Solid tincture: a known tincture key OR a `#rrggbb` hex. The renderer's full
 *  vocabulary is `tinctureColors` (13 keys) — `CATALOG.tinctures` is only the
 *  10-swatch subset, so classifying against it wrongly rejected carnation /
 *  celeste / cendree. Accept anything the renderer can actually paint. */
function isSolidTincture(value, CATALOG) {
  if (HEX_RE.test(value)) return true;
  if (CATALOG.tinctureColors && value in CATALOG.tinctureColors) return true;
  return CATALOG.tinctures.includes(value);
}

/** All valid single-char position codes (union across shields). `positionCoords`
 *  is the SSOT the renderer reads; `CATALOG.positions` is a malformed legacy list. */
function positionCodes(CATALOG) {
  const set = new Set();
  const pc = CATALOG.positionCoords ?? {};
  for (const shield of Object.keys(pc))
    for (const code of Object.keys(pc[shield])) set.add(code);
  return set;
}

/** A charge position: a non-empty string of valid position codes (e.g. "e", "abc").
 *  Armoria places one charge at several spots by concatenating codes. */
function isPositionString(p, codes) {
  if (typeof p !== "string" || !p) return false;
  for (const ch of p) if (!codes.has(ch)) return false;
  return true;
}

/**
 * Pattern / semy tincture string:
 *   `<pattern>-<t1>-<t2>[-<size>]`  (pattern ∈ patterns)
 *   `semy_of_<chargeId>-<t1>-<t2>[-<size>]`  (chargeId ∈ charges)
 * t1/t2 are solid tinctures; the optional size ∈ sizes.
 */
function isPatternTincture(value, CATALOG) {
  const isSemy = value.startsWith(SEMY_PREFIX);
  const body = isSemy ? value.slice(SEMY_PREFIX.length) : value;
  const parts = body.split("-");
  if (parts.length < 3 || parts.length > 4) return false;
  const [head, t1, t2, size] = parts;
  const headOk = isSemy
    ? CATALOG.charges.includes(head)
    : CATALOG.patterns.includes(head);
  if (!headOk) return false;
  if (!isSolidTincture(t1, CATALOG) || !isSolidTincture(t2, CATALOG))
    return false;
  if (size !== undefined && !CATALOG.sizes.includes(size)) return false;
  return true;
}

/** Any valid tincture value (solid | hex | pattern | semy). */
export function isTincture(value, CATALOG) {
  if (typeof value !== "string" || !value) return false;
  return isSolidTincture(value, CATALOG) || isPatternTincture(value, CATALOG);
}

/**
 * Validate a COA against the catalog allowlist.
 * @param {object} coa
 * @param {object} CATALOG
 * @returns {{ ok: boolean, errors: Array<{key: string, data?: object}> }}
 */
export function validate(coa, CATALOG) {
  const errors = [];
  const err = (key, data) => errors.push({ key, data });
  const c = coa ?? {};

  // t1 — required base field.
  if (!isTincture(c.t1, CATALOG)) {
    err("CS.coa.errors.missingField", { field: "t1" });
  }

  // shield (optional; defaults to heater).
  if (c.shield !== undefined && !CATALOG.shields.includes(c.shield)) {
    err("CS.coa.errors.invalidValue", { field: "shield", value: c.shield });
  }

  // division (optional).
  if (c.division && typeof c.division === "object") {
    const d = c.division;
    if (!CATALOG.divisions.includes(d.division)) {
      err("CS.coa.errors.invalidValue", {
        field: "division",
        value: d.division,
      });
    }
    if (d.line !== undefined && !CATALOG.lines.includes(d.line)) {
      err("CS.coa.errors.invalidValue", { field: "line", value: d.line });
    }
    if (d.t !== undefined && !isTincture(d.t, CATALOG)) {
      err("CS.coa.errors.invalidTincture", { field: "division.t", value: d.t });
    }
  }

  // ordinaries[].
  if (Array.isArray(c.ordinaries)) {
    c.ordinaries.forEach((o, i) => {
      if (!o || !CATALOG.ordinaries.includes(o.ordinary)) {
        err("CS.coa.errors.invalidValue", {
          field: `ordinary[${i}]`,
          value: o?.ordinary,
        });
        return;
      }
      if (o.line !== undefined && !CATALOG.lines.includes(o.line)) {
        err("CS.coa.errors.invalidValue", {
          field: `ordinary[${i}].line`,
          value: o.line,
        });
      }
      if (!isTincture(o.t, CATALOG)) {
        err("CS.coa.errors.invalidTincture", {
          field: `ordinary[${i}].t`,
          value: o.t,
        });
      }
      if (o.t2 !== undefined && !isTincture(o.t2, CATALOG)) {
        err("CS.coa.errors.invalidTincture", {
          field: `ordinary[${i}].t2`,
          value: o.t2,
        });
      }
    });
  }

  // charges[].
  if (Array.isArray(c.charges)) {
    const posCodes = positionCodes(CATALOG);
    c.charges.forEach((ch, i) => {
      if (!ch || !CATALOG.charges.includes(ch.charge)) {
        err("CS.coa.errors.invalidCharge", { index: i, value: ch?.charge });
        return;
      }
      if (!isPositionString(ch.p, posCodes)) {
        err("CS.coa.errors.invalidValue", {
          field: `charge[${i}].p`,
          value: ch.p,
        });
      }
      for (const tk of ["t", "t2", "t3"]) {
        if (ch[tk] !== undefined && !isTincture(ch[tk], CATALOG)) {
          err("CS.coa.errors.invalidTincture", {
            field: `charge[${i}].${tk}`,
            value: ch[tk],
          });
        }
      }
    });
  }

  return { ok: errors.length === 0, errors };
}
