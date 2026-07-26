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
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ChevronLeft,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Puzzle,
  Send,
  Trophy,
} from "lucide-react";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { MetricTile, PageHeader, PaperIcon } from "@/components/PaperUI";
import type { SessionStats } from "@/lib/analytics";

const CHARTS = [
  { key: "types", title: "Reading requests by type" },
  { key: "rereads", title: "Re-read clusters by question" },
  { key: "words", title: "Most-requested words" },
  { key: "pacing", title: "Pacing timeline (gap between interactions, s)" },
] as const;

type ChartKey = (typeof CHARTS)[number]["key"];

/**
 * Chart.js canvases are TRANSPARENT, and JPEG has no alpha channel — encoding
 * one directly renders every transparent pixel BLACK, which is why the PDF
 * charts came out on black. Composite onto white at the canvas's full backing
 * resolution first, so the PDF matches what the dashboard shows.
 */
function chartJpegOnWhite(canvas: HTMLCanvasElement, jpegQuality: number): string {
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/jpeg", jpegQuality);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return flat.toDataURL("image/jpeg", jpegQuality);
}

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
    Chart.defaults.color = "#263746";
    Chart.defaults.borderColor = "rgba(38,55,70,0.13)";
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const mk = (key: ChartKey, config: ChartConfiguration) => {
      const canvas = canvasRefs.current[key];
      // Cap the canvas backing resolution (phones default to DPR 3): the
      // chart canvases are embedded in the PDF, and an oversized report hits
      // Vercel's 4.5 MB request-body limit (413) on /api/report-upload.
      config.options = { ...config.options, devicePixelRatio: 2 };
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
            backgroundColor: ["#F28C79", "#F4C75B", "#76BE98", "#A58AD4", "#E9D9BC"],
            borderColor: "#263746",
            borderWidth: 1,
            borderRadius: 6,
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
            backgroundColor: "#F4C75B",
            borderColor: "#263746",
            borderWidth: 1,
            borderRadius: 6,
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
            backgroundColor: "#76BE98",
            borderColor: "#263746",
            borderWidth: 1,
            borderRadius: 6,
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
            borderColor: "#7458A6",
            backgroundColor: "rgba(165,138,212,0.22)",
            pointBackgroundColor: "#F28C79",
            pointBorderColor: "#263746",
            pointRadius: 3,
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

  const buildPdf = useCallback((jpegQuality = 0.82): jsPDF => {
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
      if (!canvas || canvas.width === 0) continue;
      const imgW = pageW - 28;
      const imgH = (canvas.height / canvas.width) * imgW;
      if (y + imgH + 6 > pdf.internal.pageSize.getHeight() - 10) {
        pdf.addPage();
        y = 15;
      }
      pdf.setFontSize(12);
      pdf.text(title, 14, y);
      y += 4;
      // JPEG (charts are flat color on white) — PNG at phone DPR made the
      // upload exceed Vercel's 4.5 MB body limit → 413 → "Delivery failed".
      pdf.addImage(chartJpegOnWhite(canvas, jpegQuality), "JPEG", 14, y, imgW, imgH);
      y += imgH + 8;
    }
    return pdf;
  }, []);

  async function sendToParent() {
    if (!stats) return;
    setDelivery("Sending…");
    try {
      const xlsxData = XLSX.write(buildXlsx(), { type: "array", bookType: "xlsx" });
      const xlsxBlob = new Blob([xlsxData], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      // Stay under Vercel's 4.5 MB request-body limit: retry at a lower
      // JPEG quality if the first render is still too heavy.
      let pdfBlob = buildPdf().output("blob");
      if (pdfBlob.size + xlsxBlob.size > 4_000_000) {
        pdfBlob = buildPdf(0.55).output("blob");
      }

      const form = new FormData();
      form.append("pdf", pdfBlob, "report.pdf");
      form.append("xlsx", xlsxBlob, "stats.xlsx");
      form.append("sessionId", sessionId);
      const res = await fetch("/api/report-upload", { method: "POST", body: form });
      if (res.ok) {
        setDelivery("Delivered to Telegram.");
      } else if (res.status === 413) {
        setDelivery("Delivery failed: the report is too large to upload.");
      } else {
        let detail = "";
        try {
          const j = (await res.json()) as { error?: string; detail?: string };
          detail = j.detail ?? j.error ?? "";
        } catch {
          /* non-JSON error body */
        }
        setDelivery(`Delivery failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
      }
    } catch (err) {
      console.error("report delivery failed:", err);
      setDelivery("Delivery failed: network error — check the connection and retry.");
    }
  }

  if (error) {
    return (
      <main className="page-shell max-w-3xl">
        <PageHeader
          eyebrow="Session complete"
          title="Session stats"
          subtitle="This page could not be drawn."
          icon={Activity}
          tone="coral"
          action={
            <Link href="/" className="paper-link" aria-label="Back to home">
              <ChevronLeft size={16} aria-hidden /> Home
            </Link>
          }
        />
        <section className="paper-card paper-empty">
          <PaperIcon icon={Activity} tone="coral" className="mb-4 h-16 w-16" size={30} />
          <h2 className="font-display text-lg font-extrabold">No report yet</h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--muted-ink)]">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell max-w-5xl">
      <PageHeader
        eyebrow="Session complete"
        title="Your practice page"
        subtitle="Patterns from this session — never an assessment."
        icon={Activity}
        tone="green"
        action={
          <Link href="/" className="paper-link" aria-label="Back to home">
            <ChevronLeft size={16} aria-hidden /> Home
          </Link>
        }
      />

      {!stats ? (
        <section aria-label="Loading session report" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="paper-card h-32 animate-pulse" aria-hidden />
            ))}
          </div>
          <div className="paper-card mt-3 h-64 animate-pulse" aria-hidden />
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <MetricTile
              label="Interactions"
              value={stats.totalEvents}
              icon={Activity}
              tone="coral"
            />
            <MetricTile
              label="Typical gap"
              value={stats.medianGapSeconds !== null ? `${stats.medianGapSeconds}s` : "—"}
              icon={Clock3}
              tone="yellow"
            />
            <MetricTile
              label="Tricky patterns"
              value={stats.topGraphemes.length}
              icon={Puzzle}
              tone="purple"
              hint={stats.topGraphemes
                .slice(0, 3)
                .map((item) => item.grapheme)
                .join(" · ")}
            />
          </div>

          {stats.quiz && (
            <section className="paper-card paper-panel-green mt-3 grid items-center gap-4 p-4 sm:grid-cols-[auto_1fr_auto] sm:p-5">
              <PaperIcon icon={Trophy} tone="green" className="h-14 w-14" size={27} />
              <div>
                <p className="paper-kicker">End-of-session quiz</p>
                <h2 className="font-display text-lg font-extrabold">Word quiz</h2>
                <p className="mt-1 text-xs text-[var(--muted-ink)]">
                  Pointed {stats.quiz.pointedCorrect}/{stats.quiz.pointedTotal} · skipped{" "}
                  {stats.quiz.skipped}
                </p>
              </div>
              <p className="font-display text-3xl font-extrabold">
                {stats.quiz.saidCorrect}/{stats.quiz.saidTotal || stats.quiz.total}
                <span className="block text-right text-[10px] font-medium uppercase tracking-wider text-[var(--muted-ink)]">
                  read right
                </span>
              </p>
            </section>
          )}

          <section className="mt-4" aria-labelledby="charts-heading">
            <div className="mb-3">
              <p className="paper-kicker">Charts &amp; visuals</p>
              <h2 id="charts-heading" className="paper-section-title">Session patterns</h2>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {CHARTS.map(({ key, title }, index) => (
                <article
                  key={key}
                  className={`paper-card p-4 ${
                    ["paper-panel-coral", "paper-panel-yellow", "paper-panel-green", "paper-panel-purple"][index]
                  }`}
                >
                  <p className="paper-kicker mb-1">Chart {index + 1}</p>
                  <h3 className="mb-3 text-sm font-semibold">{title}</h3>
                  <canvas
                    ref={(element) => {
                      canvasRefs.current[key] = element;
                    }}
                  />
                </article>
              ))}
            </div>
          </section>

          <section className="paper-card mt-4 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-3">
              <PaperIcon icon={Download} tone="beige" />
              <div>
                <p className="paper-kicker">Take it with you</p>
                <h2 className="font-display font-extrabold">Export this page</h2>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                onClick={() => XLSX.writeFile(buildXlsx(), "session-stats.xlsx")}
                className="btn-soft press flex min-h-12 items-center justify-center gap-2"
              >
                <FileSpreadsheet size={17} aria-hidden /> XLSX
              </button>
              <button
                onClick={() => buildPdf().save("session-report.pdf")}
                className="btn-soft press flex min-h-12 items-center justify-center gap-2"
              >
                <FileText size={17} aria-hidden /> PDF
              </button>
              <button
                onClick={() => void sendToParent()}
                className="btn-accent press flex min-h-12 items-center justify-center gap-2"
              >
                <Send size={17} aria-hidden /> Parent
              </button>
            </div>
            {delivery && (
              <p className="mt-3 text-center text-sm text-[var(--muted-ink)]" aria-live="polite">
                {delivery}
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
