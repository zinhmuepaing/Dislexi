import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type PaperTone = "coral" | "yellow" | "green" | "purple" | "beige";

const ICON_TONES: Record<PaperTone, string> = {
  coral: "paper-icon-coral",
  yellow: "paper-icon-yellow",
  green: "paper-icon-green",
  purple: "paper-icon-purple",
  beige: "paper-icon-beige",
};

const METRIC_TONES: Record<PaperTone, string> = {
  coral: "metric-coral",
  yellow: "metric-yellow",
  green: "metric-green",
  purple: "metric-purple",
  beige: "metric-beige",
};

interface PaperIconProps {
  icon: LucideIcon;
  tone?: PaperTone;
  size?: number;
  className?: string;
}

export function PaperIcon({
  icon: Icon,
  tone = "coral",
  size = 19,
  className = "",
}: PaperIconProps) {
  return (
    <span className={`paper-icon ${ICON_TONES[tone]} ${className}`} aria-hidden>
      <Icon size={size} strokeWidth={2.1} />
    </span>
  );
}

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  tone?: PaperTone;
  action?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  tone = "coral",
  action,
}: PageHeaderProps) {
  return (
    <header className="page-heading">
      <div className="flex min-w-0 items-center gap-3">
        <PaperIcon icon={icon} tone={tone} className="h-12 w-12 shrink-0" size={23} />
        <div className="min-w-0">
          <p className="paper-kicker">{eyebrow}</p>
          <h1 className="font-display break-words text-2xl font-extrabold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--muted-ink)]">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

interface MetricTileProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: PaperTone;
  hint?: string;
}

export function MetricTile({
  label,
  value,
  icon: Icon,
  tone = "coral",
  hint,
}: MetricTileProps) {
  return (
    <article className={`metric-card ${METRIC_TONES[tone]}`}>
      <span className="metric-icon" aria-hidden>
        <Icon size={18} strokeWidth={2.1} />
      </span>
      <strong className="font-display mt-3 text-3xl font-extrabold leading-none">{value}</strong>
      <span className="paper-kicker mt-2">{label}</span>
      {hint && <span className="mt-1 text-xs text-[var(--muted-ink)]">{hint}</span>}
    </article>
  );
}
