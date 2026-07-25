import {
  BookOpenText,
  Camera,
  GraduationCap,
  Hand,
  ShieldCheck,
  SpellCheck2,
} from "lucide-react";

const MODES = [
  {
    title: "Exam-Prep",
    description: "Rest your finger on a line or word to hear the worksheet read exactly as printed.",
    Icon: BookOpenText,
    color: "var(--point)",
  },
  {
    title: "AI Tutoring",
    description: "Ask a question and follow the narrated steps highlighted directly on the worksheet.",
    Icon: GraduationCap,
    color: "var(--ai)",
  },
  {
    title: "Stuck-Word Autopsy",
    description: "Choose a difficult word, hear it broken down, then practise it with a short quiz.",
    Icon: SpellCheck2,
    color: "var(--ok)",
  },
];

export default function GuidePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4 pb-28">
      <header className="pt-2">
        <p className="eyebrow">Quick start</p>
        <h1 className="font-display mt-1 text-2xl font-extrabold tracking-tight">
          Using Dislexi
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Set up the phone once, then choose the kind of help you need.
        </p>
      </header>

      <section className="card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--point)_12%,white)]">
            <Camera size={22} color="var(--point)" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg font-extrabold">Set up the camera</h2>
            <ol className="mt-2 space-y-2 text-sm text-[var(--ink-soft)]">
              <li><strong className="text-[var(--ink)]">1.</strong> Place the phone in the stand above the worksheet.</li>
              <li><strong className="text-[var(--ink)]">2.</strong> Keep the whole question visible and well lit.</li>
              <li><strong className="text-[var(--ink)]">3.</strong> Turn on Mirror clip only when the physical mirror is attached.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--hl)_28%,white)]">
            <Hand size={22} color="var(--ink)" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg font-extrabold">Use your finger</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              For the most accurate result, rest your fingertip directly on the word instead of
              pointing from below. Keep the paper and phone still while Dislexi checks the page.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="guide-modes">
        <h2 id="guide-modes" className="font-display mb-2 text-lg font-extrabold">
          Choose a mode
        </h2>
        <div className="flex flex-col gap-2">
          {MODES.map(({ title, description, Icon, color }) => (
            <article key={title} className="card flex items-start gap-3 p-3.5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `color-mix(in srgb, ${color} 13%, white)` }}
              >
                <Icon size={20} color={color} aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--ink-soft)]">
                  {description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card flex items-start gap-3 p-4">
        <ShieldCheck size={22} className="mt-0.5 shrink-0 text-[var(--ok)]" aria-hidden />
        <div>
          <h2 className="font-semibold">Your privacy</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-soft)]">
            Dislexi does not store raw microphone audio. The microphone is used only for commands
            and tutoring questions.
          </p>
        </div>
      </section>
    </main>
  );
}
