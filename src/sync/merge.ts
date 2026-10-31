/**
 * Combining two copies of a save that were both played on.
 *
 * `base` is the copy both started from (when known). Anything only one side
 * changed is kept. Lists of names (missions beaten, story beats seen) are
 * combined, keeping what either side added and dropping what one side
 * removed. When both sides changed the same number or setting, this device's
 * value wins: rare, and never loses a beaten mission.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A list of distinct names, which can be combined like a set. */
const isNameList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') && new Set(v).size === v.length;

export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }
  return false;
}

export function merge3(base: unknown, ours: unknown, theirs: unknown): unknown {
  if (same(ours, theirs)) return ours;
  if (base === undefined) {
    // No common copy: something only one side has is new there.
    if (ours === undefined) return theirs;
    if (theirs === undefined) return ours;
  } else {
    if (same(base, ours)) return theirs;
    if (same(base, theirs)) return ours;
  }
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out: Obj = {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(ours)])) {
      const v = merge3(b[k], ours[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (isNameList(ours) && isNameList(theirs)) {
    const b = isNameList(base) ? base : [];
    const dropped = b.filter((x) => !ours.includes(x));
    const added = ours.filter((x) => !b.includes(x) && !theirs.includes(x));
    return [...theirs.filter((x) => !dropped.includes(x)), ...added];
  }
  return ours;
}
