/**
 * Generated tutoring visuals — SPEC ONLY (backlog §1, §3, §4).
 *
 * The model emits a small, closed vocabulary of shape specs; the client draws
 * them deterministically. It never emits SVG, coordinates or geometry. That is
 * the same division already used for pointing (ARCHITECTURE §7 rule 3: the
 * model decides WHICH/WHERE, never renders the content), and it means a
 * malformed or hallucinated visual is impossible rather than merely unlikely —
 * anything outside this vocabulary is dropped by `parseVisual`.
 *
 * Pure data + validation: no React, no DOM, no network, so the whole surface is
 * testable headlessly.
 *
 * Per backlog §0, nothing here carries meaning by text alone. Numerals may be
 * drawn as decoration (team decision 2026-07-26) but the narration always
 * speaks the count and the shape always shows it.
 */

/** §1 — countable unit squares: area, and Pythagoras by counting (3²+4²=5²). */
export interface UnitGridSpec {
  kind: "unitGrid";
  /** 1–3 grids side by side. */
  grids: { rows: number; cols: number }[];
  /** Draw each grid's total as a numeral beneath it (decoration only). */
  showCounts?: boolean;
}

/** §1 — place-value blocks for combining/comparing quantities. */
export interface PlaceValueSpec {
  kind: "placeValue";
  /** Quantities to combine, e.g. 500 + 800 → two rows. */
  rows: { hundreds: number; tens: number; ones: number }[];
}

/** §4 — fold an isosceles triangle on its axis; the halves visibly match. */
export interface FoldTriangleSpec {
  kind: "foldTriangle";
  base: number;
  height: number;
}

/** §4 — cut the end off a parallelogram and slide it: it becomes a rectangle. */
export interface RearrangeParallelogramSpec {
  kind: "rearrangeParallelogram";
  base: number;
  height: number;
  /** Horizontal offset of the top edge (the slanted part that moves). */
  slant: number;
}

/** §3 — draggable right triangle; the ratio updates live with the angle. */
export interface RatioTriangleSpec {
  kind: "ratioTriangle";
  /** Starting angle in degrees. */
  angleDeg: number;
  /** Which ratio to read out as the student drags. */
  ratio: "sin" | "cos" | "tan";
  /** Real length of the adjacent side from the worksheet, if there is one. */
  adjacent?: number;
}

export type TutorVisual =
  | UnitGridSpec
  | PlaceValueSpec
  | FoldTriangleSpec
  | RearrangeParallelogramSpec
  | RatioTriangleSpec;

const int = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

/**
 * Validate a raw `visual` object from the model into a drawable spec, or null.
 *
 * Bounds are deliberately tight and silent: a 40×40 "grid" is not countable and
 * a 0° triangle is not drawable, so both are clamped into a range that always
 * renders something sane rather than rejected into a blank step.
 */
export function parseVisual(raw: unknown): TutorVisual | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;

  switch (v.kind) {
    case "unitGrid": {
      const list = Array.isArray(v.grids) ? v.grids.slice(0, 3) : [];
      const grids = list
        .map((g) => {
          const o = (g ?? {}) as Record<string, unknown>;
          return { rows: int(o.rows, 1, 12, 0), cols: int(o.cols, 1, 12, 0) };
        })
        .filter((g) => g.rows > 0 && g.cols > 0);
      if (grids.length === 0) return null;
      return { kind: "unitGrid", grids, showCounts: v.showCounts !== false };
    }

    case "placeValue": {
      const list = Array.isArray(v.rows) ? v.rows.slice(0, 3) : [];
      const rows = list
        .map((r) => {
          const o = (r ?? {}) as Record<string, unknown>;
          return {
            hundreds: int(o.hundreds, 0, 9, 0),
            tens: int(o.tens, 0, 9, 0),
            ones: int(o.ones, 0, 9, 0),
          };
        })
        .filter((r) => r.hundreds + r.tens + r.ones > 0);
      if (rows.length === 0) return null;
      return { kind: "placeValue", rows };
    }

    case "foldTriangle":
      return {
        kind: "foldTriangle",
        base: num(v.base, 1, 100, 10),
        height: num(v.height, 1, 100, 10),
      };

    case "rearrangeParallelogram": {
      const base = num(v.base, 1, 100, 10);
      return {
        kind: "rearrangeParallelogram",
        base,
        height: num(v.height, 1, 100, 8),
        // A slant wider than the base would invert the shape when it slides.
        slant: num(v.slant, 0.5, base * 0.8, Math.min(3, base * 0.3)),
      };
    }

    case "ratioTriangle": {
      const ratio = v.ratio === "cos" || v.ratio === "tan" ? v.ratio : "sin";
      const spec: RatioTriangleSpec = {
        kind: "ratioTriangle",
        // Below ~10° or above ~80° the triangle degenerates on a phone screen.
        angleDeg: num(v.angleDeg, 10, 80, 45),
        ratio,
      };
      const adj = Number(v.adjacent);
      if (Number.isFinite(adj) && adj > 0) spec.adjacent = Math.min(9999, adj);
      return spec;
    }

    default:
      return null;
  }
}

/* ── Counting scenes ─────────────────────────────────────────────────────────
 * A unitGrid step used to REPLACE the one before it, so "3", then "4", then
 * "7" flashed past as three unrelated pictures and the student never saw the
 * 3 and the 4 become the 7. The model already sends the right steps; what was
 * missing was memory between them.
 *
 * So the client folds the run of unitGrid steps into one scene: earlier groups
 * stay on screen keeping their colour, each new step adds its own group, and
 * when a step's grid is exactly the groups already up there pushed together,
 * they slide into it instead of replacing it.
 *
 * This is presentation, so it lives here and not in the prompt — the model
 * still only says WHAT quantity this step is about (ARCHITECTURE §7 rule 3),
 * and an old transcript replays identically.
 */

export interface SceneGroup {
  rows: number;
  cols: number;
}

export interface CountingScene {
  /** Every group on screen, left to right, oldest first. */
  groups: SceneGroup[];
  /** How many leading groups were counted in an earlier step: they hold still. */
  settled: number;
  /** This step is the groups' total: they slide together and are recounted. */
  merge: boolean;
  showCounts: boolean;
}

/** More than this stops being one countable picture and becomes wallpaper. */
const MAX_SCENE_GROUPS = 4;

const cellsIn = (g: SceneGroup) => g.rows * g.cols;
const sameGroup = (a: SceneGroup, b: SceneGroup) => a.rows === b.rows && a.cols === b.cols;
const totalCols = (gs: SceneGroup[]) => gs.reduce((n, g) => n + g.cols, 0);

/**
 * Lay a single-column strip on its side. The model encodes "3" as 3x1 about as
 * often as 1x3; both are just a count, a row reads better on a phone, and it
 * lets two parts written in different orientations still slide together.
 */
const asRow = (g: SceneGroup): SceneGroup =>
  g.cols === 1 && g.rows > 1 ? { rows: 1, cols: g.rows } : g;

/**
 * Fold the steps' visuals (in step order, up to and including the active one)
 * into the scene to draw. Returns null unless the active step is a unitGrid.
 *
 * Steps with no visual are transparent — narration between two pictures does
 * not wipe the first — but a DIFFERENT kind of visual ends the sequence, since
 * that is the model changing the subject.
 */
export function buildCountingScene(
  visuals: readonly (TutorVisual | undefined | null)[],
): CountingScene | null {
  const run: UnitGridSpec[] = [];
  for (let i = visuals.length - 1; i >= 0; i--) {
    const v = visuals[i];
    if (!v) continue;
    if (v.kind !== "unitGrid") break;
    run.unshift(v);
  }
  if (run.length === 0) return null;

  let groups: SceneGroup[] = [];
  let settled = 0;
  let merge = false;

  for (const spec of run) {
    if (merge) {
      // The previous step joined them; from here on they are a single block.
      groups = [{ rows: groups[0].rows, cols: totalCols(groups) }];
      settled = 1;
      merge = false;
    }
    const incoming = spec.grids.map(asRow);

    // Only call it a merge when the parts REALLY tile into the total by
    // sliding, which needs them to share a row count: 1x3 + 1x4 → 7 does;
    // 3x3 + 4x4 → 5x5 (Pythagoras) does not, however true 9 + 16 = 25 is, and
    // animating that would show the student a lie.
    //
    // The total is matched on CELL COUNT, not on columns, and its own shape is
    // ignored — what gets drawn is the parts pushed together, which carries the
    // right count whatever rows/cols the model happened to pick for it. Being
    // strict about the shape here is why the 3+4 slide only fired sometimes:
    // a total returned as 7x1 instead of 1x7 silently failed the test.
    if (
      groups.length >= 2 &&
      incoming.length === 1 &&
      groups.every((g) => g.rows === groups[0].rows) &&
      cellsIn(incoming[0]) === groups.reduce((n, g) => n + cellsIn(g), 0)
    ) {
      merge = true;
      settled = groups.length;
      continue;
    }

    // A step may resend the groups already up plus a new one; only what is
    // genuinely new gets counted.
    const extends_ =
      incoming.length >= groups.length && groups.every((g, i) => sameGroup(g, incoming[i]));
    const added = extends_ ? incoming.slice(groups.length) : incoming;
    if (added.length === 0) continue; // same picture again — leave it settled

    settled = groups.length;
    groups = [...groups, ...added];
    if (groups.length > MAX_SCENE_GROUPS) {
      groups = incoming.slice(0, MAX_SCENE_GROUPS); // start the picture over
      settled = 0;
    }
  }

  return { groups, settled, merge, showCounts: run[run.length - 1].showCounts !== false };
}

/** Squares this scene counts now: all of them on a merge, else only the new ones. */
export function countedSquares(scene: CountingScene): number {
  const from = scene.merge ? 0 : scene.settled;
  return scene.groups.slice(from).reduce((n, g) => n + cellsIn(g), 0);
}

/* ── Pacing ──────────────────────────────────────────────────────────────────
 * A visual is an ACTIVITY, not a glance. Bound to a step's lifetime it lived
 * only as long as one spoken sentence, which is far too short to count 50
 * squares and impossible for a draggable diagram. These give each kind the
 * time it actually needs. Kept here (not in the component) so the numbers are
 * testable and cannot drift from the animation they describe.
 */

/** Must match VisualCard's animation driver. */
export const VISUAL_ANIM_DELAY_MS = 350;
export const VISUAL_ANIM_MS = 1500;
/** Interactive visuals wait for the student; this only stops them stranding. */
export const EXPLORE_MAX_MS = 25_000;

/* Counting beats — shared with VisualCard's CSS so the hold below can never be
 * shorter than the animation it is meant to cover. */
/** Two groups sliding together into their total. */
export const JOIN_MS = 700;
/** One square's grow-and-wobble as it is counted. */
export const COUNT_POP_MS = 320;
/** Slowest beat: about the speed a child counts aloud, one square at a time. */
export const COUNT_BEAT_MAX_MS = 450;
/** …but a big grid must not take a minute, so it sweeps instead of counting. */
export const COUNT_TOTAL_MAX_MS = 6000;
/** After a join, the parts hold their own colours, then become one quantity. */
export const UNIFY_DELAY_MS = 500;
export const UNIFY_MS = 600;
/** Stillness after the last square, so the finished picture registers. */
export const COUNT_SETTLE_MS = 600;

/** Gap between counted squares, in beats-per-square. */
export function countStepMs(total: number): number {
  return Math.min(COUNT_BEAT_MAX_MS, COUNT_TOTAL_MAX_MS / Math.max(1, total));
}

/** How long counting `total` squares takes, start of the first to end of the last. */
export function countDurationMs(total: number): number {
  return total * countStepMs(total);
}

/** Interactive visuals hand control to the student instead of being timed. */
export function isInteractiveVisual(v: TutorVisual): boolean {
  return v.kind === "ratioTriangle";
}

/**
 * Minimum TOTAL time this visual should stay on screen, narration included —
 * the caller subtracts however long the sentence already took. 0 means the
 * visual is interactive and waits for the student rather than a clock.
 *
 * `joined` is a unitGrid step that merges the groups already on screen
 * (`CountingScene.merge`): it has a slide and a colour change to get through
 * on top of the counting, so it needs longer than the same grid shown cold.
 */
export function minOnScreenMs(v: TutorVisual, joined = false): number {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  switch (v.kind) {
    case "unitGrid": {
      // Counting is the whole point, so this tracks the animation exactly:
      // head start, optional join, one beat per square, then stillness.
      const squares = v.grids.reduce((n, g) => n + g.rows * g.cols, 0);
      const join = joined ? JOIN_MS + UNIFY_DELAY_MS + UNIFY_MS : 0;
      return clamp(
        VISUAL_ANIM_DELAY_MS + join + countDurationMs(squares) + COUNT_SETTLE_MS,
        2500,
        9000,
      );
    }
    case "placeValue": {
      const blocks = v.rows.reduce((n, r) => n + r.hundreds + r.tens + r.ones, 0);
      return clamp(1500 + blocks * 180, 2500, 9000);
    }
    case "foldTriangle":
    case "rearrangeParallelogram":
      // The motion IS the proof: it must finish, then be left still long
      // enough to register before anything moves on.
      return VISUAL_ANIM_DELAY_MS + VISUAL_ANIM_MS + 2000;
    case "ratioTriangle":
      return 0;
  }
}

/**
 * Start a hold timer when a visual is revealed; await the returned function
 * after the narration to keep it on screen for the rest of its minimum time.
 * The clock lives here rather than in the component so the page stays free of
 * impure calls during render, and so the pacing is testable on its own.
 *
 *   const hold = startVisualHold();
 *   await speak(step.say);
 *   await hold(step.visual);
 */
export function startVisualHold(now: () => number = () => Date.now()) {
  const start = now();
  return async (v: TutorVisual, joined = false): Promise<number> => {
    const remaining = minOnScreenMs(v, joined) - (now() - start);
    if (remaining <= 0) return 0;
    await new Promise((r) => setTimeout(r, remaining));
    return remaining;
  };
}

/** Spoken value of a ratio at an angle — used for the live readout. */
export function ratioValue(ratio: "sin" | "cos" | "tan", angleDeg: number): number {
  const r = (angleDeg * Math.PI) / 180;
  if (ratio === "sin") return Math.sin(r);
  if (ratio === "cos") return Math.cos(r);
  return Math.tan(r);
}
