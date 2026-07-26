"use client";

/**
 * VisualCard (backlog §1, §3, §4) — draws ONE step's generated visual in a
 * large centred panel over the frozen frame.
 *
 * Large and centred, not anchored beside a line like FormulaCard: these are
 * meant to be COUNTED or WATCHED, and a 5x5 grid offset in a corner is not
 * countable on a phone. It covers the worksheet for that step deliberately —
 * the point of the concrete-first rule is to look at the picture, not the
 * paper — and it clears before the next step (same one-at-a-time rule as the
 * formula card, REWORK 4).
 *
 * Geometry comes entirely from a validated spec (lib/tutor-visual.ts); the
 * model never sends coordinates or SVG. Numerals appear only as decoration —
 * the narration always speaks the count too (backlog §0).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  ratioValue,
  VISUAL_ANIM_DELAY_MS,
  VISUAL_ANIM_MS,
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

function UnitGrid({ spec }: { spec: UnitGridSpec }) {
  const maxDim = Math.max(...spec.grids.map((g) => Math.max(g.rows, g.cols)));
  const cell = Math.max(8, Math.min(22, 132 / maxDim));
  const gap = 2;
  return (
    <div className="flex flex-wrap items-end justify-center gap-4">
      {spec.grids.map((g, gi) => {
        const w = g.cols * (cell + gap);
        const h = g.rows * (cell + gap);
        return (
          <div key={gi} className="flex flex-col items-center gap-1">
            <svg width={w} height={h} role="presentation">
              {Array.from({ length: g.rows }).map((_, r) =>
                Array.from({ length: g.cols }).map((_, c) => (
                  <rect
                    key={`${r}-${c}`}
                    x={c * (cell + gap)}
                    y={r * (cell + gap)}
                    width={cell}
                    height={cell}
                    rx={2}
                    fill={TINTS[gi % TINTS.length]}
                    stroke={INK}
                    strokeWidth={1.2}
                  />
                )),
              )}
            </svg>
            {spec.showCounts && (
              <span className="text-[15px] font-semibold tabular-nums text-[var(--ink)]">
                {g.rows * g.cols}
              </span>
            )}
          </div>
        );
      })}
    </div>
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

export function VisualCard({ visual }: { visual: TutorVisual }) {
  let body: React.ReactNode = null;
  if (visual.kind === "unitGrid") body = <UnitGrid spec={visual} />;
  else if (visual.kind === "placeValue") body = <PlaceValue spec={visual} />;
  else if (visual.kind === "foldTriangle") body = <FoldTriangle spec={visual} />;
  else if (visual.kind === "rearrangeParallelogram") body = <RearrangeParallelogram spec={visual} />;
  else if (visual.kind === "ratioTriangle") body = <RatioTriangle spec={visual} />;
  if (!body) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-3">
      <div className="fadein max-h-[78%] max-w-[88%] overflow-auto rounded-[14px] border-2 border-[var(--ink)] bg-[var(--paper-card)] px-4 py-3 shadow-[5px_6px_0_rgba(38,55,70,0.2)]">
        {body}
      </div>
    </div>
  );
}
