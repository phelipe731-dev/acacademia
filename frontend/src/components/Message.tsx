import { AlertCircle, CheckCircle2, Info } from "lucide-react";

const config = {
  error: {
    classes: "border-danger/20 bg-danger-soft text-danger",
    icon: AlertCircle,
    role: "alert" as const
  },
  success: {
    classes: "border-success/25 bg-success-soft text-success-dark",
    icon: CheckCircle2,
    role: "status" as const
  },
  info: {
    classes: "border-line bg-surface text-ink/80",
    icon: Info,
    role: "status" as const
  }
};

export function Message({ message, type = "info" }: { message: string; type?: "info" | "error" | "success" }) {
  const { classes, icon: Icon, role } = config[type];
  return (
    <div
      role={role}
      aria-live={type === "error" ? "assertive" : "polite"}
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm font-medium animate-fade-up ${classes}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
