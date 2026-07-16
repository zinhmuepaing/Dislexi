/**
 * Send a test report through a deployment's /api/report-upload → Telegram.
 * Run: npx tsx scripts/test-telegram-delivery.mts <https://your-domain>
 *
 * Builds a real one-page PDF (jsPDF) and a real XLSX (SheetJS) clearly labeled
 * as a delivery test, creates a session via /api/sessions, and posts all three
 * to /api/report-upload — exercising the exact client delivery path
 * (ARCHITECTURE.md §5.5). Both documents arrive in the configured chat.
 */

import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

const base = process.argv[2]?.replace(/\/$/, "");
if (!base?.startsWith("https://") && !base?.startsWith("http://localhost")) {
  console.error("usage: npx tsx scripts/test-telegram-delivery.mts https://<domain>");
  process.exit(1);
}

const sessionRes = await fetch(`${base}/api/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "exam_prep" }),
});
if (!sessionRes.ok) {
  console.error(`POST /api/sessions failed: ${sessionRes.status}`);
  process.exit(1);
}
const { sessionId } = (await sessionRes.json()) as { sessionId: string };
console.log(`session created: ${sessionId}`);

const stamp = new Date().toISOString();
const pdf = new jsPDF({ unit: "mm", format: "a4" });
pdf.setFontSize(16);
pdf.text("Dislexi — delivery test", 14, 20);
pdf.setFontSize(10);
pdf.text(`This is a plumbing test of report delivery, sent ${stamp}.`, 14, 30);
pdf.text("Real reports contain session charts and stats.", 14, 36);
const pdfBytes = pdf.output("arraybuffer");

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.json_to_sheet([{ note: "Dislexi delivery test", sentAt: stamp, sessionId }]),
  "DeliveryTest",
);
const xlsxBytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

const form = new FormData();
form.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "report.pdf");
form.append(
  "xlsx",
  new Blob([xlsxBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }),
  "stats.xlsx",
);
form.append("sessionId", sessionId);

const res = await fetch(`${base}/api/report-upload`, { method: "POST", body: form });
const body = await res.text();
console.log(`report-upload: ${res.status} ${body}`);
console.log(res.ok ? "DELIVERY TEST SENT — check the Telegram chat" : "DELIVERY FAILED");
process.exit(res.ok ? 0 : 1);
