"use client";

/**
 * Post-session analytics (IMPLEMENTATION_PLAN Phase 5, ARCHITECTURE.md §5.6).
 *
 * Fetches POST /api/session-end for this session and renders Chart.js
 * canvases. Everything shown is a struggle & engagement INDICATOR derived
 * from typed events — never an emotional or clinical claim.
 *
 * Exports are client-side: XLSX via SheetJS, PDF via jsPDF + chart canvas
 * snapshots; delivery = multipart POST /api/report-upload → Telegram.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import type { SessionStats } from "@/lib/analytics";

const CHARTS = [
  { key: "types", title: "Reading requests by type" },
  { key: "rereads", title: "Re-read clusters by question" },
  { key: "words", title: "Most-requested words" },
  { key: "pacing", title: "Pacing timeline (gap between interactions, s)" },
] as const;

type ChartKey = (typeof CHARTS)[number]["key"];

export default function StatsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const canvasRefs = useRef<Partial<Record<ChartKey, HTMLCanvasElement | null>>>({});
  const chartsRef = useRef<Chart[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session-end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`session-end ${r.status}`);
        const { stats } = (await r.json()) as { stats: SessionStats };
        setStats(stats);
      })
      .catch(() => setError("Could not load session stats (is logging configured?)."));
  }, [sessionId]);

  useEffect(() => {
    if (!stats) return;
    const mk = (key: ChartKey, config: ChartConfiguration) => {
      const canvas = canvasRefs.current[key];
      if (canvas) chartsRef.current.push(new Chart(canvas, config));
    };

    mk("types", {
      type: "bar",
      data: {
        labels: Object.keys(stats.countsByType),
        datasets: [
          {
            label: "events",
            data: Object.values(stats.countsByType),
            backgroundColor: "#34d399",
          },
        ],
      },
      options: { plugins: { legend: { display: false } } },
    });
    mk("rereads", {
      type: "bar",
      data: {
        labels: Object.keys(stats.rereadsByQuestion),
        datasets: [
          {
            label: "re-reads",
            data: Object.values(stats.rereadsByQuestion),
            backgroundColor: "#fbbf24",
          },
        ],
      },
      options: { plugins: { legend: { display: false } } },
    });
    mk("words", {
      type: "bar",
      data: {
        labels: stats.topWords.map((w) => w.word),
        datasets: [
          {
            label: "requests",
            data: stats.topWords.map((w) => w.count),
            backgroundColor: "#38bdf8",
          },
        ],
      },
      options: { indexAxis: "y", plugins: { legend: { display: false } } },
    });
    mk("pacing", {
      type: "line",
      data: {
        labels: stats.pacingGapsSeconds.map((_, i) => `${i + 1}`),
        datasets: [
          {
            label: "gap (s)",
            data: stats.pacingGapsSeconds,
            borderColor: "#a78bfa",
            backgroundColor: "#a78bfa44",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: { plugins: { legend: { display: false } } },
    });

    return () => {
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];
    };
  }, [stats]);

  const buildXlsx = useCallback((): XLSX.WorkBook => {
    const s = stats!;
    const wb = XLSX.utils.book_new();
    const sheet = (rows: object[], name: string) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    sheet(
      [
        {
          sessionId,
          totalEvents: s.totalEvents,
          medianGapSeconds: s.medianGapSeconds ?? "",
          firstEventAt: s.firstEventAt ?? "",
          lastEventAt: s.lastEventAt ?? "",
        },
      ],
      "Overview",
    );
    sheet(
      Object.entries(s.countsByType).map(([type, count]) => ({ type, count })),
      "CountsByType",
    );
    sheet(
      Object.entries(s.rereadsByQuestion).map(([question, rereads]) => ({ question, rereads })),
      "RereadsByQuestion",
    );
    sheet(s.topWords, "TopWords");
    sheet(s.topGraphemes, "TopGraphemes");
    sheet(
      s.pacingGapsSeconds.map((gapSeconds, i) => ({ interaction: i + 1, gapSeconds })),
      "PacingGaps",
    );
    return wb;
  }, [stats, sessionId]);

  const buildPdf = useCallback((): jsPDF => {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    let y = 15;
    pdf.setFontSize(16);
    pdf.text("Reading session report", 14, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.text(
      "Struggle & engagement indicators — derived from session events, not assessments.",
      14,
      y,
    );
    y += 8;
    for (const { key, title } of CHARTS) {
      const canvas = canvasRefs.current[key];
      if (!canvas) continue;
      const imgW = pageW - 28;
      const imgH = (canvas.height / canvas.width) * imgW;
      if (y + imgH + 6 > pdf.internal.pageSize.getHeight() - 10) {
        pdf.addPage();
        y = 15;
      }
      pdf.setFontSize(12);
      pdf.text(title, 14, y);
      y += 4;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 14, y, imgW, imgH);
      y += imgH + 8;
    }
    return pdf;
  }, []);

  async function sendToParent() {
    if (!stats) return;
    setDelivery("Sending…");
    try {
      const xlsxData = XLSX.write(buildXlsx(), { type: "array", bookType: "xlsx" });
      const form = new FormData();
      form.append("pdf", buildPdf().output("blob"), "report.pdf");
      form.append(
        "xlsx",
        new Blob([xlsxData], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        "stats.xlsx",
      );
      form.append("sessionId", sessionId);
      const res = await fetch("/api/report-upload", { method: "POST", body: form });
      setDelivery(res.ok ? "Delivered to Telegram." : "Delivery failed (Telegram configured?).");
    } catch {
      setDelivery("Delivery failed.");
    }
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-md p-4">
        <h1 className="text-xl font-bold">Session stats</h1>
        <p className="mt-4 text-sm opacity-70">{error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Session stats</h1>
      <p className="text-xs opacity-60">
        Struggle &amp; engagement indicators — derived from session events, not assessments.
      </p>
      {!stats ? (
        <p className="text-sm opacity-70">Loading…</p>
      ) : (
        <>
          <p className="text-sm">
            {stats.totalEvents} events · median gap{" "}
            {stats.medianGapSeconds !== null ? `${stats.medianGapSeconds}s` : "n/a"}
            {stats.topGraphemes.length > 0 &&
              ` · tricky patterns: ${stats.topGraphemes
                .slice(0, 3)
                .map((g) => g.grapheme)
                .join(", ")}`}
          </p>
          {CHARTS.map(({ key, title }) => (
            <section key={key} className="rounded-xl bg-white/5 p-3">
              <h2 className="mb-2 text-sm font-semibold">{title}</h2>
              <canvas
                ref={(el) => {
                  canvasRefs.current[key] = el;
                }}
              />
            </section>
          ))}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => XLSX.writeFile(buildXlsx(), "session-stats.xlsx")}
              className="rounded-xl bg-white/10 p-3 font-semibold active:scale-95"
            >
              Download XLSX
            </button>
            <button
              onClick={() => buildPdf().save("session-report.pdf")}
              className="rounded-xl bg-white/10 p-3 font-semibold active:scale-95"
            >
              Download PDF
            </button>
            <button
              onClick={() => void sendToParent()}
              className="rounded-xl bg-violet-500 p-3 font-semibold text-white active:scale-95"
            >
              Send to parent (Telegram)
            </button>
            {delivery && <p className="text-sm opacity-70">{delivery}</p>}
          </div>
        </>
      )}
    </main>
  );
}
