"use client";

/**
 * VisualCard (backlog §1, §3, §4) — draws ONE step's generated visual in a
 * large panel over the frozen frame.
 *
 * Large, not anchored beside a line like FormulaCard: these are meant to be
 * COUNTED or WATCHED, and a 5x5 grid offset in a corner is not countable on a
 * phone. But it is deliberately NOT centred — the centre of the frame is where
 * the question and working live — so it parks on the side of the frame the
 * current step is not pointing at (`avoid`), and it is dismissable (`onClose`)
 * so a student is never stuck looking at a picture instead of the paper.
 *
 * Geometry comes entirely from a validated spec (lib/tutor-visual.ts); the
 * model never sends coordinates or SVG. Numerals appear only as decoration —
 * the narration always speaks the count too (backlog §0).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import {
  buildCountingScene,
  countedSquares,
  countStepMs,
  ratioValue,
  COUNT_POP_MS,
  JOIN_MS,
  UNIFY_DELAY_MS,
  UNIFY_MS,
  VISUAL_ANIM_DELAY_MS,
  VISUAL_ANIM_MS,
  type CountingScene,
  type PlaceValueSpec,
  type RatioTriangleSpec,
  type RearrangeParallelogramSpec,
  type FoldTriangleSpec,
  type TutorVisual,
  type UnitGridSpec,
} from "@/lib/tutor-visual";

const INK = "var(--ink)";
const POINT = "var(--color-point)";
const HL = "var(--hl-strong)";
const TINTS = ["rgba(255,176,32,0.45)", "rgba(236,77,37,0.35)", "rgba(43,108,176,0.30)"];

// Shared with lib/tutor-visual.ts so the hold time cannot drift from the
// animation it is meant to cover.
const ANIM_MS = VISUAL_ANIM_MS;
const ANIM_DELAY_MS = VISUAL_ANIM_DELAY_MS;

/** Drives 0 → 1 once; `replay()` restarts it. Motion means something here, so
 *  it plays with the narration and then STOPS (no looping beside a reading
 *  task — ADHD guidance elsewhere in the app applies here too). */
function usePlayOnce(): { t: number; replay: () => void; done: boolean } {
  const [t, setT] = useState(0);
  const raf = useRef(0);
  const run = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ANIM_MS);
      // ease-in-out so the motion reads as deliberate, not mechanical
      setT(p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => {
    const id = setTimeout(run, ANIM_DELAY_MS); // let the narration start first
    return () => {
      clearTimeout(id);
      cancelAnimationFrame(raf.current);
    };
  }, [run]);
  return { t, replay: run, done: t >= 1 };
}

/* ── §1 unit grids ──────────────────────────────────────────────────────── */

const CELL_GAP = 2;
/** Space between groups — wide enough to hold the "+" that appears before they join. */
const GROUP_GAP = 20;
const LABEL_H = 20;

/**
 * Ticks 1..`to` in step with the squares popping, so the numeral and the
 * picture can never disagree. Its own component because counting a large grid
 * would otherwise re-render several hundred <rect>s on every beat; this way it
 * re-renders one <text>.
 */
function CountUp({
  to,
  beat,
  delay,
  x,
  y,
}: {
  to: number;
  beat: number;
  delay: number;
  x: number;
  y: number;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.max(0, Math.min(to, Math.floor((now - start - delay) / beat) + 1));
      setN((v) => (v === k ? v : k));
      if (k < to) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, beat, delay]);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={15}
      fontWeight={600}
      fill={INK}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {n > 0 ? n : ""}
    </text>
  );
}

/**
 * Countable squares, counted OUT LOUD by the picture: each square fills with a
 * grow-and-wobble on its own beat while the numeral beneath ticks up with it.
 *
 * The scene (lib/tutor-visual.ts) decides what is on screen: groups from
 * earlier steps stay and keep their colour, so when the "4" appears the "3" is
 * still there to be added to, and when the step after that IS the total the two
 * slide together into it rather than replacing it. Everything here is geometry
 * for that decision — one <svg> rather than a flex row of them, because the
 * groups have to move relative to each other.
 */
function UnitGrid({ spec, scene }: { spec: UnitGridSpec; scene?: CountingScene | null }) {
  const s = scene ?? buildCountingScene([spec]);
  const [runId, setRunId] = useState(0);
  // Which run has finished, rather than a flag: replaying bumps runId, so
  // `done` falls back to false on its own without resetting state in an effect.
  const [finished, setFinished] = useState(-1);
  const done = finished === runId;

  const counted = s ? countedSquares(s) : 0;
  const beat = countStepMs(counted);
  const countStart = ANIM_DELAY_MS + (s?.merge ? JOIN_MS : 0);
  const endMs = countStart + counted * beat + (s?.merge ? UNIFY_DELAY_MS + UNIFY_MS : 0);

  useEffect(() => {
    const t = setTimeout(() => setFinished(runId), endMs);
    return () => clearTimeout(t);
  }, [endMs, runId]);

  if (!s) return null;
  const { groups, settled, merge, showCounts } = s;
  const n = groups.length;

  // Size for the WIDEST the picture will ever be, so a join moves the squares
  // without also resizing them. Groups that cannot join (different row counts,
  // e.g. the Pythagoras 3x3/4x4/5x5) keep the old sizing exactly.
  const maxRows = Math.max(...groups.map((g) => g.rows));
  const uniformRows = groups.every((g) => g.rows === groups[0].rows);
  const cols = groups.map((g) => g.cols);
  const spanCols = uniformRows ? cols.reduce((a, b) => a + b, 0) : Math.max(...cols);
  const cell = Math.max(8, Math.min(22, 132 / Math.max(maxRows, spanCols)));
  const step = cell + CELL_GAP;

  const widths = cols.map((c) => c * step);
  const joinedW = widths.reduce((a, b) => a + b, 0);
  const gridH = maxRows * step;
  const W = joinedW + (n - 1) * GROUP_GAP;
  const H = gridH + (showCounts ? LABEL_H : 0);

  // x of each group with the gaps closed; `spread` is the extra it sits out by
  // while the groups are still apart.
  const mergedX: number[] = [];
  widths.reduce((acc, w) => (mergedX.push(acc), acc + w), 0);
  const spread = (k: number) => k * GROUP_GAP;

  // On a merge every square is recounted (that is the point — the 7 is counted
  // as a 7); otherwise only the groups this step brought in.
  const countFrom = merge ? 0 : settled;
  let ci = 0;

  return (
    <Animated replay={() => setRunId((r) => r + 1)} done={done}>
      <svg
        width={W}
        height={H}
        role="presentation"
        style={{ "--vc-unify": TINTS[0] } as React.CSSProperties}
      >
        <g
          key={runId}
          style={
            merge
              ? ({
                  "--vc-recentre": `${((n - 1) * GROUP_GAP) / 2}px`,
                  animation: `vc-recentre ${JOIN_MS}ms ease-in-out ${ANIM_DELAY_MS}ms both`,
                } as React.CSSProperties)
              : undefined
          }
        >
          {groups.map((g, k) => {
            const counts = k >= countFrom;
            const firstIndex = ci;
            const yTop = gridH - g.rows * step;
            const squares = Array.from({ length: g.rows * g.cols }, (_, q) => {
              const r = Math.floor(q / g.cols);
              const c = q % g.cols;
              const at = counts ? countStart + ci++ * beat : 0;
              const pop = counts
                ? `${merge ? "vc-count-again" : "vc-count-in"} ${COUNT_POP_MS}ms ease-out ${at}ms backwards`
                : "";
              const unify = merge
                ? `vc-unify ${UNIFY_MS}ms ease ${countStart + counted * beat + UNIFY_DELAY_MS}ms forwards`
                : "";
              return (
                <rect
                  key={q}
                  className="vc-square"
                  x={c * step}
                  y={yTop + r * step}
                  width={cell}
                  height={cell}
                  rx={2}
                  fill={TINTS[k % TINTS.length]}
                  stroke={INK}
                  strokeWidth={1.2}
                  style={{ animation: [pop, unify].filter(Boolean).join(", ") || undefined }}
                />
              );
            });
            return (
              <g key={k} transform={`translate(${mergedX[k] + (merge ? 0 : spread(k))} 0)`}>
                <g
                  style={
                    merge
                      ? ({
                          "--vc-dx": `${spread(k)}px`,
                          animation: `vc-join ${JOIN_MS}ms ease-in-out ${ANIM_DELAY_MS}ms both`,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  {squares}
                  {showCounts &&
                    (merge ? (
                      // The parts' own totals belong to the parts: they go as
                      // the parts stop being separate things.
                      <text
                        x={widths[k] / 2}
                        y={gridH + 15}
                        textAnchor="middle"
                        fontSize={15}
                        fontWeight={600}
                        fill={INK}
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          animation: `vc-transient ${ANIM_DELAY_MS + JOIN_MS}ms ease both`,
                        }}
                      >
                        {g.rows * g.cols}
                      </text>
                    ) : counts ? (
                      <CountUp
                        to={g.rows * g.cols}
                        beat={beat}
                        delay={countStart + firstIndex * beat}
                        x={widths[k] / 2}
                        y={gridH + 15}
                      />
                    ) : (
                      <text
                        x={widths[k] / 2}
                        y={gridH + 15}
                        textAnchor="middle"
                        fontSize={15}
                        fontWeight={600}
                        fill={INK}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {g.rows * g.cols}
                      </text>
                    ))}
                </g>
              </g>
            );
          })}

          {/* Only ever drawn when the groups are about to be combined, and gone
              by the time they are — so it can never mislabel a comparison. */}
          {merge &&
            groups.slice(1).map((_, i) => (
              <text
                key={`p${i}`}
                x={mergedX[i + 1] + spread(i + 1) - GROUP_GAP / 2}
                y={gridH / 2 + 6}
                textAnchor="middle"
                fontSize={17}
                fontWeight={700}
                fill={INK}
                style={{ animation: `vc-transient ${ANIM_DELAY_MS + JOIN_MS}ms ease both` }}
              >
                +
              </text>
            ))}

          {merge && showCounts && (
            <CountUp to={counted} beat={beat} delay={countStart} x={joinedW / 2} y={gridH + 15} />
          )}
        </g>
      </svg>
    </Animated>
  );
}

/* ── §1 place-value blocks ──────────────────────────────────────────────── */

/** A hundred drawn as an actual 10x10 of units, so it stays countable. */
function Flat({ size = 34 }: { size?: number }) {
  const c = size / 10;
  return (
    <svg width={size} height={size} role="presentation">
      <rect width={size} height={size} fill={TINTS[0]} stroke={INK} strokeWidth={1.4} />
      {Array.from({ length: 9 }).map((_, i) => (
        <g key={i} stroke={INK} strokeWidth={0.5} opacity={0.55}>
          <line x1={(i + 1) * c} y1={0} x2={(i + 1) * c} y2={size} />
          <line x1={0} y1={(i + 1) * c} x2={size} y2={(i + 1) * c} />
        </g>
      ))}
    </svg>
  );
}

function Rod({ size = 34 }: { size?: number }) {
  const c = size / 10;
  return (
    <svg width={c * 1.6} height={size} role="presentation">
      <rect width={c * 1.6} height={size} fill={TINTS[1]} stroke={INK} strokeWidth={1.2} />
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={i} x1={0} y1={(i + 1) * c} x2={c * 1.6} y2={(i + 1) * c} stroke={INK} strokeWidth={0.5} opacity={0.55} />
      ))}
    </svg>
  );
}

function PlaceValue({ spec }: { spec: PlaceValueSpec }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {spec.rows.map((r, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          {i > 0 && <span className="text-[15px] font-semibold text-[var(--ink-soft)]">+</span>}
          <div className="flex flex-wrap items-end justify-center gap-1.5">
            {Array.from({ length: r.hundreds }).map((_, k) => <Flat key={`h${k}`} />)}
            {Array.from({ length: r.tens }).map((_, k) => <Rod key={`t${k}`} />)}
            {Array.from({ length: r.ones }).map((_, k) => (
              <svg key={`o${k}`} width={5} height={5} role="presentation">
                <rect width={5} height={5} fill={TINTS[2]} stroke={INK} strokeWidth={1} />
              </svg>
            ))}
          </div>
          <span className="text-[15px] font-semibold tabular-nums text-[var(--ink)]">
            {r.hundreds * 100 + r.tens * 10 + r.ones}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── §4 fold an isosceles triangle onto itself ──────────────────────────── */

function FoldTriangle({ spec }: { spec: FoldTriangleSpec }) {
  const { t, replay, done } = usePlayOnce();
  const W = 200;
  const H = 150;
  // Honour the spec's proportions: a tall narrow triangle must not render the
  // same as a squat one, or the picture contradicts the worksheet.
  const scale = Math.min((W * 0.72) / spec.base, (H * 0.76) / spec.height);
  const bw = spec.base * scale;
  const bh = spec.height * scale;
  const cx = W / 2;
  const yb = H / 2 + bh / 2;
  const apex = `${cx},${yb - bh}`;
  const right = `${cx + bw / 2},${yb}`;
  const left = `${cx - bw / 2},${yb}`;

  return (
    <Animated replay={replay} done={done}>
      <svg width={W} height={H} role="presentation">
        {/* right half stays put */}
        <polygon points={`${apex} ${right} ${cx},${yb}`} fill={TINTS[0]} stroke={INK} strokeWidth={2} />
        {/* left half reflects across the axis: scaleX 1 → -1 about cx */}
        <g transform={`translate(${cx} 0) scale(${1 - 2 * t} 1) translate(${-cx} 0)`}>
          <polygon points={`${apex} ${left} ${cx},${yb}`} fill={TINTS[1]} stroke={INK} strokeWidth={2} />
        </g>
        <line x1={cx} y1={yb - bh} x2={cx} y2={yb} stroke={POINT} strokeWidth={1.6} strokeDasharray="5 4" />
      </svg>
    </Animated>
  );
}

/* ── §4 cut a parallelogram and slide it into a rectangle ───────────────── */

function RearrangeParallelogram({ spec }: { spec: RearrangeParallelogramSpec }) {
  const { t, replay, done } = usePlayOnce();
  const W = 220;
  const H = 140;
  const scale = Math.min((W * 0.78) / (spec.base + spec.slant), (H * 0.62) / spec.height);
  const b = spec.base * scale;
  const s = spec.slant * scale;
  const h = spec.height * scale;
  const x0 = (W - (b + s)) / 2;
  const yb = H * 0.78;
  const yt = yb - h;

  return (
    <Animated replay={replay} done={done}>
      <svg width={W} height={H} role="presentation">
        {/* body that stays: the parallelogram minus its left triangle */}
        <polygon
          points={`${x0 + s},${yt} ${x0 + s + b},${yt} ${x0 + b},${yb} ${x0 + s},${yb}`}
          fill={TINTS[0]}
          stroke={INK}
          strokeWidth={2}
        />
        {/* the cut triangle slides right by b to complete the rectangle */}
        <g transform={`translate(${t * b} 0)`}>
          <polygon
            points={`${x0 + s},${yt} ${x0 + s},${yb} ${x0},${yb}`}
            fill={TINTS[1]}
            stroke={INK}
            strokeWidth={2}
          />
        </g>
        <line x1={x0 + s} y1={yt} x2={x0 + s} y2={yb} stroke={POINT} strokeWidth={1.6} strokeDasharray="5 4" />
      </svg>
    </Animated>
  );
}

function Animated({
  children,
  replay,
  done,
}: {
  children: React.ReactNode;
  replay: () => void;
  done: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {children}
      <button
        onClick={replay}
        disabled={!done}
        className="tool-chip press pointer-events-auto flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium disabled:opacity-40"
        aria-label="Play the movement again"
      >
        <RotateCcw size={13} /> Again
      </button>
    </div>
  );
}

/* ── §3 draggable ratio triangle ────────────────────────────────────────── */

function RatioTriangle({ spec }: { spec: RatioTriangleSpec }) {
  const [angle, setAngle] = useState(Math.round(spec.angleDeg));
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 230;
  const H = 175;
  const x0 = 26; // pivot: the angle being dragged lives here
  const yb = H - 34;

  // FIXED HYPOTENUSE, angle swept from the pivot — the "unwrapping the unit
  // circle" construction. Deriving the legs from the angle (rather than capping
  // a height to fit the box) is what keeps the DRAWN angle equal to the LABELLED
  // angle: an earlier version clipped the height, so a 43° triangle was drawn at
  // ~38°, and dragging could never exceed ~37°. The picture must not lie.
  const L = Math.min(W - x0 - 22, yb - 18);
  const rad = (angle * Math.PI) / 180;
  const bx = x0 + L * Math.cos(rad); // foot of the perpendicular
  const py = yb - L * Math.sin(rad); // apex

  const setFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const xIn = ((clientX - rect.left) / rect.width) * W;
      const yIn = ((clientY - rect.top) / rect.height) * H;
      const deg = (Math.atan2(Math.max(1, yb - yIn), Math.max(1, xIn - x0)) * 180) / Math.PI;
      // Whole degrees: the readout says "sin 38°", so the value must be sin of
      // exactly 38°, not of 37.55° rounded for display. Also steadier to drag.
      setAngle(Math.min(80, Math.max(10, Math.round(deg))));
    },
    [yb],
  );

  const dragging = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setFromPointer(e.clientX, e.clientY);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging.current) setFromPointer(e.clientX, e.clientY);
  };
  const onUp = () => {
    dragging.current = false;
  };

  const val = ratioValue(spec.ratio, angle);
  const opposite = spec.adjacent ? spec.adjacent * Math.tan(rad) : null;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        role="presentation"
        className="pointer-events-auto touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* faint arc showing the path the apex sweeps — the "unit circle" idea */}
        <path
          d={`M ${x0 + L * Math.cos((80 * Math.PI) / 180)} ${yb - L * Math.sin((80 * Math.PI) / 180)} A ${L} ${L} 0 0 1 ${x0 + L * Math.cos((10 * Math.PI) / 180)} ${yb - L * Math.sin((10 * Math.PI) / 180)}`}
          fill="none"
          stroke={INK}
          strokeWidth={1}
          strokeDasharray="3 5"
          opacity={0.35}
        />
        <polygon
          points={`${x0},${yb} ${bx},${yb} ${bx},${py}`}
          fill={TINTS[0]}
          stroke={INK}
          strokeWidth={2}
        />
        {/* right angle sits at the foot of the perpendicular */}
        <path
          d={`M ${bx - 11} ${yb} L ${bx - 11} ${yb - 11} L ${bx} ${yb - 11}`}
          fill="none"
          stroke={INK}
          strokeWidth={1.4}
        />
        {/* the angle being dragged, at the pivot */}
        <path
          d={`M ${x0 + 26} ${yb} A 26 26 0 0 0 ${x0 + 26 * Math.cos(rad)} ${yb - 26 * Math.sin(rad)}`}
          fill="none"
          stroke={POINT}
          strokeWidth={2}
        />
        {/* drag handle on the apex */}
        <circle cx={bx} cy={py} r={11} fill={HL} stroke={INK} strokeWidth={2} />
        <circle cx={bx} cy={py} r={3.5} fill={INK} />
        <text x={x0 + 32} y={yb - 7} fontSize={13} fontWeight={600} fill={INK}>
          {angle}°
        </text>
      </svg>
      <div className="flex items-baseline gap-2 text-[15px] font-semibold text-[var(--ink)]">
        <span className="tabular-nums">
          {spec.ratio} {Math.round(angle)}° = {val.toFixed(2)}
        </span>
        {opposite !== null && (
          <span className="tabular-nums text-[var(--ink-soft)]">≈ {opposite.toFixed(1)}</span>
        )}
      </div>
      <span className="text-[11px] text-[var(--ink-soft)]">drag the dot</span>
    </div>
  );
}

/* ── panel ──────────────────────────────────────────────────────────────── */

export function VisualCard({
  visual,
  avoid,
  scene,
  onClose,
}: {
  visual: TutorVisual;
  /** Normalized rect the card must not cover (the step's spot on the paper). */
  avoid?: { y: number; h: number } | null;
  /** unitGrid only: what earlier steps already put on screen, so the counting
   *  builds up instead of restarting. Omitted → this step's grids alone. */
  scene?: CountingScene | null;
  onClose?: () => void;
}) {
  let body: React.ReactNode = null;
  if (visual.kind === "unitGrid") body = <UnitGrid spec={visual} scene={scene} />;
  else if (visual.kind === "placeValue") body = <PlaceValue spec={visual} />;
  else if (visual.kind === "foldTriangle") body = <FoldTriangle spec={visual} />;
  else if (visual.kind === "rearrangeParallelogram") body = <RearrangeParallelogram spec={visual} />;
  else if (visual.kind === "ratioTriangle") body = <RatioTriangle spec={visual} />;
  if (!body) return null;

  // Never centred: the middle of the frame is where the worksheet's question
  // and working usually sit. Park the card on whichever side of the frame the
  // current step is NOT pointing at — low step → card high, high step → card
  // low (kept clear of the bottom sheet). No anchor info → default to the top.
  const stepCentre = avoid ? avoid.y + avoid.h / 2 : 1;
  const placeLow = stepCentre < 0.5;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 flex justify-center p-3 ${
        placeLow ? "items-end pb-[58dvh]" : "items-start pt-14"
      }`}
    >
      <div className="fadein relative max-h-[38dvh] max-w-[88%] overflow-auto rounded-[14px] border-2 border-[var(--ink)] bg-[var(--paper-card)] px-4 py-3 shadow-[5px_6px_0_rgba(38,55,70,0.2)]">
        {onClose && (
          <button
            onClick={onClose}
            className="pointer-events-auto press absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]"
            aria-label="Close this picture"
          >
            <X size={14} />
          </button>
        )}
        {body}
      </div>
    </div>
  );
}
