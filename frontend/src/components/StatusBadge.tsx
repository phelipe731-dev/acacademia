type Tone = "green" | "red" | "yellow" | "gray";

const toneClass: Record<Tone, { badge: string; dot: string }> = {
  green: { badge: "border-success/25 bg-success-soft text-success-dark", dot: "bg-success" },
  red: { badge: "border-danger/20 bg-danger-soft text-danger", dot: "bg-danger" },
  yellow: { badge: "border-warning/25 bg-warning-soft text-warning", dot: "bg-warning" },
  gray: { badge: "border-line bg-paper text-muted", dot: "bg-muted" }
};

const labels: Record<string, string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  INADIMPLENTE: "Inadimplente",
  PAGO: "Pago",
  PENDENTE: "Pendente",
  ATRASADO: "Atrasado",
  CANCELADO: "Cancelado"
};

export function StatusBadge({ value }: { value: string }) {
  const tone: Tone =
    value === "ATIVO" || value === "PAGO"
      ? "green"
      : value === "INADIMPLENTE" || value === "ATRASADO"
        ? "red"
        : value === "PENDENTE"
          ? "yellow"
          : "gray";
  const { badge, dot } = toneClass[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {labels[value] ?? value}
    </span>
  );
}
