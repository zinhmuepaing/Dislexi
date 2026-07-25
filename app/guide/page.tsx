import Link from "next/link";
import {
  BookOpenText,
  Camera,
  ChevronRight,
  FlipHorizontal2,
  GraduationCap,
  Hand,
  ShieldCheck,
  Sparkles,
  SpellCheck2,
  Sun,
} from "lucide-react";
import { PageHeader, PaperIcon, type PaperTone } from "@/components/PaperUI";

const SETUP_STEPS: {
  label: string;
  hint: string;
  Icon: typeof Camera;
  tone: PaperTone;
}[] = [
  { label: "Place phone", hint: "Stand above the page", Icon: Camera, tone: "coral" },
  { label: "Light the page", hint: "Keep every line clear", Icon: Sun, tone: "yellow" },
  { label: "Check mirror", hint: "Match the physical clip", Icon: FlipHorizontal2, tone: "purple" },
];

const MODES: {
  href: string;
  title: string;
  description: string;
  Icon: typeof BookOpenText;
  tone: PaperTone;
  panelClass: string;
}[] = [
  {
    href: "/exam-prep",
    title: "Exam-Prep",
    description: "Hear the printed words exactly.",
    Icon: BookOpenText,
    tone: "coral",
    panelClass: "paper-panel-coral",
  },
  {
    href: "/tutoring",
    title: "AI Tutoring",
    description: "See each step on the worksheet.",
    Icon: GraduationCap,
    tone: "purple",
    panelClass: "paper-panel-purple",
  },
  {
    href: "/autopsy",
    title: "Word Autopsy",
    description: "Break down and practise a word.",
    Icon: SpellCheck2,
    tone: "green",
    panelClass: "paper-panel-green",
  },
];

export default function GuidePage() {
  return (
    <main className="page-shell max-w-4xl">
      <PageHeader
        eyebrow="Quick start"
        title="Using Dislexi"
        subtitle="Three small steps, then choose your tool."
        icon={Sparkles}
        tone="yellow"
      />

      <section aria-labelledby="setup-heading">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="paper-kicker">01 · setup</p>
            <h2 id="setup-heading" className="paper-section-title">Ready the page</h2>
          </div>
          <span className="stamp stamp-ok">about 20 seconds</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {SETUP_STEPS.map(({ label, hint, Icon, tone }, index) => (
            <article key={label} className="paper-card relative p-4">
              <span className="absolute right-3 top-2 font-mono text-3xl font-medium text-[var(--line)]">
                {index + 1}
              </span>
              <PaperIcon icon={Icon} tone={tone} />
              <h3 className="mt-5 font-semibold">{label}</h3>
              <p className="mt-1 text-xs text-[var(--muted-ink)]">{hint}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="paper-card paper-panel-yellow my-4 grid items-center gap-4 p-4 sm:grid-cols-[auto_1fr] sm:p-5">
        <span className="paper-illustration mx-auto h-24 w-28">
          <Hand size={44} strokeWidth={1.8} aria-hidden />
        </span>
        <div>
          <p className="paper-kicker">Best gesture</p>
          <h2 className="font-display mt-1 text-xl font-extrabold">Rest on the word</h2>
          <p className="mt-2 text-sm text-[var(--muted-ink)]">
            Touch the word with your fingertip and keep the page still. This is more accurate than
            pointing from below.
          </p>
          <div className="mt-3 flex items-center gap-2" aria-hidden>
            <span className="h-2 flex-1 rounded bg-[var(--line)]" />
            <span className="h-4 w-4 rounded-full border-2 border-[var(--ink)] bg-[var(--coral)]" />
            <span className="h-2 flex-1 rounded bg-[var(--line)]" />
          </div>
        </div>
      </section>

      <section aria-labelledby="modes-heading">
        <div className="mb-3">
          <p className="paper-kicker">02 · choose</p>
          <h2 id="modes-heading" className="paper-section-title">Pick a mode</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {MODES.map(({ href, title, description, Icon, tone, panelClass }) => (
            <Link
              key={href}
              href={href}
              className={`paper-card press group flex min-h-36 flex-col p-4 ${panelClass}`}
            >
              <div className="flex items-start justify-between">
                <PaperIcon icon={Icon} tone={tone} />
                <ChevronRight
                  size={20}
                  className="transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </div>
              <h3 className="font-display mt-5 font-extrabold">{title}</h3>
              <p className="mt-1 text-xs text-[var(--muted-ink)]">{description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="paper-card paper-panel-green mt-4 flex items-center gap-3 p-4">
        <PaperIcon icon={ShieldCheck} tone="green" />
        <div>
          <h2 className="font-semibold">Audio stays private</h2>
          <p className="mt-0.5 text-xs text-[var(--muted-ink)]">
            Commands are processed, but raw microphone audio is never stored.
          </p>
        </div>
      </section>
    </main>
  );
}
