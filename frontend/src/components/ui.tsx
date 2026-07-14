import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { ApiError } from "@/lib/api";

/** Cabecalho padrao de pagina. */
export function PageHeader({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** Estado vazio com icone e mensagem. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty-state">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/5 text-ink/40">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-ink/70">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-ink/50">{hint}</p> : null}
    </div>
  );
}

/** Bloco de skeletons para listas/tabelas em carregamento. */
export function SkeletonRows({ rows = 4, height = "h-12" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`skeleton w-full ${height}`} />
      ))}
    </div>
  );
}

/** Card compacto para substituir tabelas em telas pequenas. */
export function MobileRecord({
  title,
  subtitle,
  badge,
  children,
  actions,
  className = ""
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={`mobile-record ${className}`}>
      <div className="mobile-record-header">
        <div className="min-w-0">
          <div className="mobile-record-title">{title}</div>
          {subtitle ? <div className="mobile-record-subtitle">{subtitle}</div> : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {children ? <div className="mobile-record-grid">{children}</div> : null}
      {actions ? <div className="mobile-action-row">{actions}</div> : null}
    </article>
  );
}

/** Linha rotulada dentro de MobileRecord. */
export function MobileRecordRow({
  label,
  value,
  className = ""
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mobile-record-row ${className}`}>
      <div className="mobile-record-label">{label}</div>
      <div className="mobile-record-value">{value}</div>
    </div>
  );
}

/** Extrai mensagem legivel de um erro desconhecido (catch). */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
