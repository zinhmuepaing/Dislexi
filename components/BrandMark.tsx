import { BookOpenText, ScanLine } from "lucide-react";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <span
      className={`brand-mark relative flex h-11 w-11 shrink-0 items-center justify-center ${className}`}
      aria-hidden
    >
      <BookOpenText size={23} strokeWidth={2.1} />
      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-md border-[1.5px] border-[var(--ink)] bg-[var(--coral)]">
        <ScanLine size={11} strokeWidth={2.4} />
      </span>
    </span>
  );
}
