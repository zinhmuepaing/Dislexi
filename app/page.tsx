import Link from "next/link";

const modes = [
  {
    href: "/exam-prep",
    title: "Exam-Prep Mode",
    description:
      "Point at a question and hear it read exactly as written — SEAB-standard literal reading with session analytics.",
    accent: "border-emerald-400",
  },
  {
    href: "/tutoring",
    title: "AI Tutoring",
    description:
      "Ask a question about the worksheet and get a step-by-step explanation with on-screen highlights.",
    accent: "border-sky-400",
  },
  {
    href: "/autopsy",
    title: "Stuck-Word Autopsy",
    description:
      "Sound out a stuck word chunk by chunk, then trace it on paper to unlock it.",
    accent: "border-amber-400",
  },
];

export default function ModeSelector() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Dislexi</h1>
      <p className="text-sm opacity-70">
        Put the phone in its stand with the mirror clip on, lay the worksheet flat in
        front of it, then pick a mode.
      </p>
      {modes.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          className={`rounded-xl border-l-4 ${m.accent} bg-white/5 p-4 shadow transition hover:bg-white/10`}
        >
          <h2 className="text-lg font-semibold">{m.title}</h2>
          <p className="mt-1 text-sm opacity-70">{m.description}</p>
        </Link>
      ))}
    </main>
  );
}
