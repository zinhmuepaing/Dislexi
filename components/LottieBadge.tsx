"use client";

/**
 * Small self-hosted Lottie player (REWORK R8). The lottie_light build
 * (SVG-only, no eval) is dynamically imported so it never blocks first
 * paint; animations live in /public/lottie/ (see ATTRIBUTIONS.md — original
 * CC0 works, no external requests at runtime).
 */

import { useEffect, useRef } from "react";

interface LottieBadgeProps {
  /** Path under /public, e.g. "/lottie/star-pop.json". */
  src: string;
  className?: string;
  loop?: boolean;
  /** "span" when the badge sits inside a <button>, whose content model allows
   *  phrasing only. Safe with an absolutely-positioned className: such a span
   *  is blockified, so width/height classes still apply. */
  as?: "div" | "span";
}

export function LottieBadge({ src, className, loop = true, as: Tag = "div" }: LottieBadgeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let anim: { destroy: () => void } | null = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void import("lottie-web/build/player/lottie_light").then((mod) => {
      if (disposed || !ref.current) return;
      anim = mod.default.loadAnimation({
        container: ref.current,
        renderer: "svg",
        loop,
        autoplay: true,
        path: src,
      });
    });
    return () => {
      disposed = true;
      anim?.destroy();
    };
  }, [src, loop]);

  return <Tag ref={ref} className={className} aria-hidden />;
}
