"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  CreditCard,
  DollarSign,
  Dumbbell,
  ExternalLink,
  FileText,
  History,
  LayoutGrid,
  ListChecks,
  Mail,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Save,
  ShoppingBag,
  UserCheck,
  UserRound,
  Wallet,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, use, useEffect, useMemo, useState } from "react";

import { Message } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, MobileRecord, MobileRecordRow, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatDate, formatDateTime, formatMoney, getSession } from "@/lib/api";
import type { CheckIn, Payment, PaymentStatus, Sale, Student, StudentStatus, TrainingPlan, UserRole } from "@/lib/types";

type DetailTab = "overview" | "financial" | "workouts" | "attendance" | "registration";
type PaymentPreviewFilter = "TODAS" | "PAGO" | "PENDENTE" | "ATRASADO";
type FinancialTypeFilter = "TODOS" | "MENSALIDADE" | "VENDA" | "PRAZO";
type FinancialStatusFilter = "TODOS" | PaymentStatus | "PRAZO";
type AttendancePeriod = "MONTH" | "30_DAYS" | "ALL";

interface ActivityItem {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  at: string;
  tone: "green" | "blue" | "purple" | "orange" | "red" | "gray";
}

interface FinancialRow {
  key: string;
  date: string;
  dueDate?: string | null;
  paidAt?: string | null;
  amount: string | number;
  method: string;
  status: string;
  type: "MENSALIDADE" | "VENDA" | "PRAZO";
  description: string;
  notes?: string | null;
}

const tabs: Array<{ id: DetailTab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Visao geral", icon: LayoutGrid },
  { id: "financial", label: "Financeiro", icon: DollarSign },
  { id: "workouts", label: "Fichas de treino", icon: Dumbbell },
  { id: "attendance", label: "Frequencia", icon: UserCheck },
  { id: "registration", label: "Cadastro", icon: ClipboardList }
];

const paymentPreviewFilters: Array<{ value: PaymentPreviewFilter; label: string; className: string }> = [
  { value: "TODAS", label: "Todas", className: "border-brand/25 bg-brand-soft text-brand" },
  { value: "PAGO", label: "Pagas", className: "border-success/25 bg-success-soft text-success-dark" },
  { value: "PENDENTE", label: "Pendentes", className: "border-warning/25 bg-warning-soft text-warning" },
  { value: "ATRASADO", label: "Vencidas", className: "border-danger/20 bg-danger-soft text-danger" }
];

const paymentMethodLabels: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  CARTAO: "Cartao",
  OUTRO: "Outro",
  PRAZO: "Prazo"
};

function salePaymentLabel(sale: Sale) {
  if (sale.payment_method !== "PRAZO") return paymentMethodLabels[sale.payment_method] ?? sale.payment_method;
  const method = sale.installment_payment_method ? ` via ${paymentMethodLabels[sale.installment_payment_method] ?? sale.installment_payment_method}` : "";
  return `Prazo · ${sale.installments_count}x${method}`;
}

function saleItemsLabel(sale: Sale) {
  return sale.items
    .map((item) => `${item.quantity}x ${item.product?.name ?? `Produto #${item.product_id}`}`)
    .join(", ");
}

function sumMoney<T>(items: T[], picker: (item: T) => string | number) {
  return items.reduce((total, item) => total + Number(picker(item) || 0), 0);
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhone(value?: string | null): string {
  const digits = onlyDigits(value ?? "").slice(0, 11);
  if (digits.length <= 2) return digits || "-";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCpf(value?: string | null): string {
  const digits = onlyDigits(value ?? "").slice(0, 11);
  if (!digits) return "-";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function todayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysBetween(start: Date, end = todayStart()): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay));
}

function daysUntil(date: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((date.getTime() - todayStart().getTime()) / millisecondsPerDay);
}

function nextDueDateFromDay(dueDay: number, reference = todayStart()): Date {
  const normalizedDay = Math.min(Math.max(Number(dueDay) || 1, 1), 31);
  const daysInMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
  let dueDate = new Date(reference.getFullYear(), reference.getMonth(), Math.min(normalizedDay, daysInMonth));
  if (dueDate < reference) {
    const nextMonthDays = new Date(reference.getFullYear(), reference.getMonth() + 2, 0).getDate();
    dueDate = new Date(reference.getFullYear(), reference.getMonth() + 1, Math.min(normalizedDay, nextMonthDays));
  }
  return dueDate;
}

function dateInputValue(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDateTimeParts(value?: string | null): { date: string; time: string } {
  if (!value) return { date: "-", time: "-" };
  const formatted = formatDateTime(value);
  const [date, time] = formatted.split(", ");
  return { date: date || formatted, time: time || "-" };
}

function currentMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
  };
}

function isWithinLastDays(value: string, days: number): boolean {
  const date = new Date(value);
  const limit = new Date();
  limit.setDate(limit.getDate() - days);
  return date >= limit;
}

function isWithinCurrentMonth(value: string): boolean {
  const date = new Date(value);
  const { start, end } = currentMonthRange();
  return date >= start && date < end;
}

function paymentSortDate(payment: Payment): string {
  return payment.paid_at || payment.due_date || payment.created_at;
}

function activityToneClass(tone: ActivityItem["tone"]): string {
  const classes = {
    green: "bg-success-soft text-success-dark",
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    orange: "bg-warning-soft text-warning",
    red: "bg-danger-soft text-danger",
    gray: "bg-paper text-muted"
  };
  return classes[tone];
}

function activePlanSortValue(plan: TrainingPlan): number {
  return new Date(plan.updated_at || plan.created_at).getTime();
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [student, setStudent] = useState<Student | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [trainingPlans, setTrainingPlans] = useState<TrainingPlan[]>([]);
  const [role, setRole] = useState<UserRole>("RECEPCAO");
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [cloningPlanId, setCloningPlanId] = useState<number | null>(null);
  const [deactivatingPlanId, setDeactivatingPlanId] = useState<number | null>(null);
  const [previewFilter, setPreviewFilter] = useState<PaymentPreviewFilter>("TODAS");
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [attendancePeriod, setAttendancePeriod] = useState<AttendancePeriod>("30_DAYS");
  const [financialType, setFinancialType] = useState<FinancialTypeFilter>("TODOS");
  const [financialStatusFilter, setFinancialStatusFilter] = useState<FinancialStatusFilter>("TODOS");
  const [financialMethod, setFinancialMethod] = useState("TODOS");
  const [financialStartDate, setFinancialStartDate] = useState("");
  const [financialEndDate, setFinancialEndDate] = useState("");
  const [planForm, setPlanForm] = useState({
    name: "Ficha A",
    objective: "",
    start_date: new Date().toISOString().slice(0, 10),
    reassessment_date: "",
    notes: ""
  });

  async function load(currentRole = role) {
    const canSeeFinancial = currentRole !== "PROFESSOR";
    const optionalErrors: string[] = [];
    async function optionalFetch<T>(path: string, fallback: T, fallbackMessage: string): Promise<T> {
      try {
        return await apiFetch<T>(path);
      } catch (error) {
        optionalErrors.push(getErrorMessage(error, fallbackMessage));
        return fallback;
      }
    }

    const [studentData, paymentsData, salesData, checkinsData, trainingData] = await Promise.all([
      apiFetch<Student>(`/students/${id}`),
      canSeeFinancial ? optionalFetch<Payment[]>(`/students/${id}/payments`, [], "Nao foi possivel carregar mensalidades.") : Promise.resolve([]),
      canSeeFinancial ? optionalFetch<Sale[]>(`/students/${id}/sales`, [], "Nao foi possivel carregar vendas do aluno.") : Promise.resolve([]),
      canSeeFinancial ? optionalFetch<CheckIn[]>(`/checkins?student_id=${id}&limit=200`, [], "Nao foi possivel carregar frequencia.") : Promise.resolve([]),
      optionalFetch<TrainingPlan[]>(`/students/${id}/training-plans`, [], "Nao foi possivel carregar fichas de treino.")
    ]);
    setStudent(studentData);
    setPayments(paymentsData);
    setSales(salesData);
    setCheckins(checkinsData);
    setTrainingPlans(trainingData);
    if (optionalErrors.length) {
      setMessage({ text: optionalErrors[0], type: "error" });
    }
  }

  useEffect(() => {
    const sessionRole = getSession()?.user.role ?? "RECEPCAO";
    setRole(sessionRole);
    load(sessionRole).catch((err) => setMessage({ text: getErrorMessage(err, "Erro ao carregar aluno."), type: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!student || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiFetch<Student>(`/students/${student.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: student.name,
          phone: student.phone,
          email: student.email || null,
          cpf: student.cpf || null,
          birth_date: student.birth_date || null,
          plan: student.plan,
          plan_end_date: student.plan_end_date || null,
          monthly_fee: Number(student.monthly_fee),
          due_day: student.due_day,
          status: student.status,
          notes: student.notes || null
        })
      });
      setStudent(updated);
      setMessage({ text: "Aluno atualizado.", type: "success" });
      setActiveTab("overview");
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao atualizar aluno."), type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!student || creatingPlan) return;
    setCreatingPlan(true);
    setMessage(null);
    try {
      const plan = await apiFetch<TrainingPlan>(`/students/${student.id}/training-plans`, {
        method: "POST",
        body: JSON.stringify({
          name: planForm.name,
          objective: planForm.objective || null,
          start_date: planForm.start_date || null,
          reassessment_date: planForm.reassessment_date || null,
          notes: planForm.notes || null,
          is_active: true
        })
      });
      setMessage({ text: "Ficha de treino criada.", type: "success" });
      setPlanForm({
        name: "Ficha A",
        objective: "",
        start_date: new Date().toISOString().slice(0, 10),
        reassessment_date: "",
        notes: ""
      });
      router.push(`/app/fichas/${plan.id}`);
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao criar ficha de treino."), type: "error" });
    } finally {
      setCreatingPlan(false);
    }
  }

  async function handleClonePlan(plan: TrainingPlan) {
    if (!student || cloningPlanId !== null) return;
    setCloningPlanId(plan.id);
    setMessage(null);
    try {
      await apiFetch<TrainingPlan>(`/training-plans/${plan.id}/clone`, {
        method: "POST",
        body: JSON.stringify({ student_id: student.id, name: `${plan.name} - copia` })
      });
      setMessage({ text: "Ficha clonada para o aluno.", type: "success" });
      await load(role);
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao clonar ficha."), type: "error" });
    } finally {
      setCloningPlanId(null);
    }
  }

  async function handleDeactivatePlan(plan: TrainingPlan) {
    if (deactivatingPlanId !== null) return;
    if (!window.confirm(`Inativar a ficha ${plan.name}?`)) return;
    setDeactivatingPlanId(plan.id);
    setMessage(null);
    try {
      await apiFetch<TrainingPlan>(`/training-plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false })
      });
      setMessage({ text: "Ficha inativada.", type: "success" });
      await load(role);
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao inativar ficha."), type: "error" });
    } finally {
      setDeactivatingPlanId(null);
    }
  }

  const paidPayments = useMemo(() => payments.filter((payment) => payment.status === "PAGO"), [payments]);
  const openPayments = useMemo(
    () => payments.filter((payment) => payment.status === "PENDENTE" || payment.status === "ATRASADO"),
    [payments]
  );
  const overduePayments = useMemo(() => payments.filter((payment) => payment.status === "ATRASADO"), [payments]);
  const installmentSales = useMemo(() => sales.filter((sale) => sale.payment_method === "PRAZO"), [sales]);
  const openPaymentsTotal = useMemo(() => sumMoney(openPayments, (payment) => payment.amount), [openPayments]);
  const installmentSalesTotal = useMemo(() => sumMoney(installmentSales, (sale) => sale.total_amount), [installmentSales]);
  const salesTotal = useMemo(() => sumMoney(sales, (sale) => sale.total_amount), [sales]);
  const monthCheckins = useMemo(() => checkins.filter((checkin) => isWithinCurrentMonth(checkin.checked_in_at)), [checkins]);
  const last30Checkins = useMemo(() => checkins.filter((checkin) => isWithinLastDays(checkin.checked_in_at, 30)), [checkins]);
  const latestPaidPayment = useMemo(
    () => [...paidPayments].sort((a, b) => new Date(paymentSortDate(b)).getTime() - new Date(paymentSortDate(a)).getTime())[0],
    [paidPayments]
  );
  const activeWorkout = useMemo(
    () => [...trainingPlans].filter((plan) => plan.is_active).sort((a, b) => activePlanSortValue(b) - activePlanSortValue(a))[0],
    [trainingPlans]
  );

  const nextDueInfo = useMemo(() => {
    if (!student) return { date: null as Date | null, label: "-", helper: "-" };
    const pendingPayment = [...payments]
      .filter((payment) => payment.status === "PENDENTE")
      .sort((a, b) => (parseDateOnly(a.due_date)?.getTime() ?? 0) - (parseDateOnly(b.due_date)?.getTime() ?? 0))[0];
    const dueDate = parseDateOnly(pendingPayment?.due_date) ?? nextDueDateFromDay(student.due_day);
    return {
      date: dueDate,
      label: formatDate(dueDate.toISOString()),
      helper: `Dia ${student.due_day} de cada mes`
    };
  }, [payments, student]);

  const financialStatus = useMemo(() => {
    const overdue = [...overduePayments].sort(
      (a, b) => (parseDateOnly(a.due_date)?.getTime() ?? 0) - (parseDateOnly(b.due_date)?.getTime() ?? 0)
    )[0];
    if (overdue) {
      const overdueDate = parseDateOnly(overdue.due_date);
      return {
        tone: "danger" as const,
        title: "Mensalidade vencida",
        description: overdueDate ? `Pagamento atrasado ha ${daysBetween(overdueDate)} dias.` : "Existe mensalidade vencida.",
        icon: XCircle
      };
    }
    const pending = [...payments]
      .filter((payment) => payment.status === "PENDENTE")
      .sort((a, b) => (parseDateOnly(a.due_date)?.getTime() ?? 0) - (parseDateOnly(b.due_date)?.getTime() ?? 0))[0];
    if (pending) {
      return {
        tone: "warning" as const,
        title: "Mensalidade pendente",
        description: `Vencimento em ${formatDate(pending.due_date)}.`,
        icon: AlertTriangle
      };
    }
    return {
      tone: "success" as const,
      title: "Aluno em dia",
      description: latestPaidPayment
        ? `Ultimo pagamento em ${formatDate(latestPaidPayment.paid_at || latestPaidPayment.due_date)} via ${paymentMethodLabels[latestPaidPayment.payment_method] ?? latestPaidPayment.payment_method}.`
        : "Nenhuma pendencia financeira registrada.",
      icon: CheckCircle2
    };
  }, [latestPaidPayment, overduePayments, payments]);

  const activities = useMemo<ActivityItem[]>(() => {
    if (!student) return [];
    const items: ActivityItem[] = [];
    payments.forEach((payment) => {
      items.push({
        key: `payment-${payment.id}-${payment.updated_at}`,
        icon: payment.status === "PAGO" ? CheckCircle2 : Receipt,
        title: payment.status === "PAGO" ? "Mensalidade paga" : payment.status === "ATRASADO" ? "Mensalidade vencida" : "Mensalidade registrada",
        description: `${formatMoney(payment.amount)}${payment.payment_method ? ` via ${paymentMethodLabels[payment.payment_method] ?? payment.payment_method}` : ""}`,
        at: payment.paid_at || payment.updated_at || payment.created_at || payment.due_date,
        tone: payment.status === "PAGO" ? "green" : payment.status === "ATRASADO" ? "red" : "orange"
      });
    });
    checkins.forEach((checkin) => {
      items.push({
        key: `checkin-${checkin.id}`,
        icon: UserCheck,
        title: "Frequencia registrada",
        description: "Check-in realizado",
        at: checkin.checked_in_at,
        tone: "blue"
      });
    });
    trainingPlans.forEach((plan) => {
      items.push({
        key: `training-${plan.id}-${plan.updated_at}`,
        icon: Dumbbell,
        title: "Ficha de treino atualizada",
        description: `${plan.name}${plan.objective ? ` - ${plan.objective}` : ""}`,
        at: plan.updated_at || plan.created_at,
        tone: "purple"
      });
    });
    sales.forEach((sale) => {
      items.push({
        key: `sale-${sale.id}`,
        icon: ShoppingBag,
        title: sale.payment_method === "PRAZO" ? "Venda parcelada registrada" : "Produto vendido",
        description: `${formatMoney(sale.total_amount)} - ${saleItemsLabel(sale) || salePaymentLabel(sale)}`,
        at: sale.created_at,
        tone: "orange"
      });
    });
    if (student.updated_at && student.updated_at !== student.created_at) {
      items.push({
        key: `student-${student.id}-${student.updated_at}`,
        icon: FileText,
        title: "Cadastro atualizado",
        description: "Dados cadastrais alterados",
        at: student.updated_at,
        tone: "gray"
      });
    }
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [checkins, payments, sales, student, trainingPlans]);

  const financialRows = useMemo<FinancialRow[]>(() => {
    const rows: FinancialRow[] = payments.map((payment) => ({
      key: `payment-${payment.id}`,
      date: payment.due_date,
      dueDate: payment.due_date,
      paidAt: payment.paid_at,
      amount: payment.amount,
      method: payment.payment_method,
      status: payment.status,
      type: "MENSALIDADE",
      description: "Mensalidade",
      notes: payment.notes
    }));
    sales.forEach((sale) => {
      rows.push({
        key: `sale-${sale.id}`,
        date: sale.created_at,
        amount: sale.total_amount,
        method: sale.payment_method,
        status: sale.payment_method === "PRAZO" ? "PRAZO" : "PAGO",
        type: sale.payment_method === "PRAZO" ? "PRAZO" : "VENDA",
        description: saleItemsLabel(sale) || `Venda #${sale.id}`,
        notes: sale.notes
      });
    });
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [payments, sales]);

  const filteredFinancialRows = useMemo(() => {
    return financialRows.filter((row) => {
      if (financialType !== "TODOS" && row.type !== financialType) return false;
      if (financialStatusFilter !== "TODOS" && row.status !== financialStatusFilter) return false;
      if (financialMethod !== "TODOS" && row.method !== financialMethod) return false;
      const rowTime = new Date(row.date).getTime();
      if (financialStartDate && rowTime < new Date(`${financialStartDate}T00:00:00`).getTime()) return false;
      if (financialEndDate && rowTime > new Date(`${financialEndDate}T23:59:59`).getTime()) return false;
      return true;
    });
  }, [financialEndDate, financialMethod, financialRows, financialStartDate, financialStatusFilter, financialType]);

  const filteredCheckins = useMemo(() => {
    if (attendancePeriod === "ALL") return checkins;
    if (attendancePeriod === "MONTH") return checkins.filter((checkin) => isWithinCurrentMonth(checkin.checked_in_at));
    return checkins.filter((checkin) => isWithinLastDays(checkin.checked_in_at, 30));
  }, [attendancePeriod, checkins]);

  if (!student) {
    if (message?.type === "error") return <Message message={message.text} type="error" />;
    return (
      <div className="space-y-5">
        <div className="panel p-5">
          <SkeletonRows rows={2} />
        </div>
        <div className="panel p-5">
          <SkeletonRows rows={6} height="h-10" />
        </div>
      </div>
    );
  }

  const readOnly = role !== "ADMIN";
  const canSeeFinancial = role !== "PROFESSOR";
  const canEditTraining = role === "ADMIN" || role === "PROFESSOR";
  const lastCheckin = checkins[0];
  const lastCheckinParts = formatDateTimeParts(lastCheckin?.checked_in_at);
  const averagePerWeek = last30Checkins.length / 4.285;
  const lastPresenceDays = lastCheckin ? daysBetween(new Date(lastCheckin.checked_in_at)) : null;

  return (
    <div className="space-y-4 animate-fade-up">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title text-[26px]">{student.name}</h1>
            <StatusBadge value={student.status} />
          </div>
          <p className="page-subtitle">Resumo completo do aluno, financeiro, frequencia e treinos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {role === "ADMIN" ? (
            <button className="btn-secondary" type="button" onClick={() => setActiveTab("registration")}>
              <Pencil className="h-4 w-4" aria-hidden />
              Editar aluno
            </button>
          ) : null}
          <Link className="btn-secondary" href="/app/alunos">
            Voltar para alunos
          </Link>
        </div>
      </header>

      <nav className="overflow-x-auto border-b border-line" aria-label="Secoes do aluno">
        <div className="flex min-w-max gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${
                  active ? "border-brand text-brand" : "border-transparent text-ink/65 hover:text-ink"
                }`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {message ? <Message message={message.text} type={message.type} /> : null}

      {activeTab === "overview" ? (
        <OverviewTab
          activeWorkout={activeWorkout}
          activities={activities}
          averagePerWeek={averagePerWeek}
          canEditTraining={canEditTraining}
          canSeeFinancial={canSeeFinancial}
          checkins={checkins}
          financialStatus={financialStatus}
          last30Checkins={last30Checkins}
          lastCheckinParts={lastCheckinParts}
          lastPresenceDays={lastPresenceDays}
          monthCheckins={monthCheckins}
          nextDueInfo={nextDueInfo}
          openPaymentsTotal={openPaymentsTotal}
          payments={payments}
          previewFilter={previewFilter}
          sales={sales}
          setActiveTab={setActiveTab}
          setPreviewFilter={setPreviewFilter}
          setShowAllActivities={setShowAllActivities}
          showAllActivities={showAllActivities}
          student={student}
        />
      ) : null}

      {activeTab === "financial" ? (
        <FinancialTab
          canSeeFinancial={canSeeFinancial}
          filteredRows={filteredFinancialRows}
          financialEndDate={financialEndDate}
          financialMethod={financialMethod}
          financialStartDate={financialStartDate}
          financialStatus={financialStatusFilter}
          financialType={financialType}
          installmentSales={installmentSales}
          installmentSalesTotal={installmentSalesTotal}
          openPayments={openPayments}
          openPaymentsTotal={openPaymentsTotal}
          paidPayments={paidPayments}
          sales={sales}
          salesTotal={salesTotal}
          setFinancialEndDate={setFinancialEndDate}
          setFinancialMethod={setFinancialMethod}
          setFinancialStartDate={setFinancialStartDate}
          setFinancialStatus={setFinancialStatusFilter}
          setFinancialType={setFinancialType}
        />
      ) : null}

      {activeTab === "workouts" ? (
        <WorkoutsTab
          canEditTraining={canEditTraining}
          cloningPlanId={cloningPlanId}
          creatingPlan={creatingPlan}
          deactivatingPlanId={deactivatingPlanId}
          handleClonePlan={handleClonePlan}
          handleCreatePlan={handleCreatePlan}
          handleDeactivatePlan={handleDeactivatePlan}
          planForm={planForm}
          setPlanForm={setPlanForm}
          trainingPlans={trainingPlans}
        />
      ) : null}

      {activeTab === "attendance" ? (
        <AttendanceTab
          attendancePeriod={attendancePeriod}
          averagePerWeek={averagePerWeek}
          canSeeFinancial={canSeeFinancial}
          checkins={checkins}
          filteredCheckins={filteredCheckins}
          last30Checkins={last30Checkins}
          lastCheckinParts={lastCheckinParts}
          lastPresenceDays={lastPresenceDays}
          monthCheckins={monthCheckins}
          setAttendancePeriod={setAttendancePeriod}
          student={student}
        />
      ) : null}

      {activeTab === "registration" ? (
        <RegistrationTab
          handleUpdate={handleUpdate}
          readOnly={readOnly}
          saving={saving}
          setStudent={setStudent}
          student={student}
        />
      ) : null}
    </div>
  );
}

function OverviewTab({
  activeWorkout,
  activities,
  averagePerWeek,
  canEditTraining,
  canSeeFinancial,
  checkins,
  financialStatus,
  last30Checkins,
  lastCheckinParts,
  lastPresenceDays,
  monthCheckins,
  nextDueInfo,
  openPaymentsTotal,
  payments,
  previewFilter,
  sales,
  setActiveTab,
  setPreviewFilter,
  setShowAllActivities,
  showAllActivities,
  student
}: {
  activeWorkout?: TrainingPlan;
  activities: ActivityItem[];
  averagePerWeek: number;
  canEditTraining: boolean;
  canSeeFinancial: boolean;
  checkins: CheckIn[];
  financialStatus: { tone: "success" | "warning" | "danger"; title: string; description: string; icon: LucideIcon };
  last30Checkins: CheckIn[];
  lastCheckinParts: { date: string; time: string };
  lastPresenceDays: number | null;
  monthCheckins: CheckIn[];
  nextDueInfo: { date: Date | null; label: string; helper: string };
  openPaymentsTotal: number;
  payments: Payment[];
  previewFilter: PaymentPreviewFilter;
  sales: Sale[];
  setActiveTab: (tab: DetailTab) => void;
  setPreviewFilter: (filter: PaymentPreviewFilter) => void;
  setShowAllActivities: (value: boolean) => void;
  showAllActivities: boolean;
  student: Student;
}) {
  const visibleActivities = showAllActivities ? activities : activities.slice(0, 5);
  const previewPayments = payments
    .filter((payment) => (previewFilter === "TODAS" ? true : payment.status === previewFilter))
    .slice(0, 5);
  const financialToneClass = {
    success: "border-success/20 bg-success-soft text-success-dark",
    warning: "border-warning/25 bg-warning-soft text-warning",
    danger: "border-danger/20 bg-danger-soft text-danger"
  }[financialStatus.tone];
  const FinancialIcon = financialStatus.icon;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
          <MetricCard icon={Calendar} tone="red" label="Plano atual" value={student.plan} />
          <MetricCard icon={CalendarClock} tone="blue" label="Proximo vencimento" value={nextDueInfo.label} hint={nextDueInfo.helper} />
          <MetricCard icon={DollarSign} tone="green" label="Mensalidade" value={formatMoney(student.monthly_fee)} />
          <MetricCard icon={Wallet} tone="orange" label="Em aberto" value={formatMoney(openPaymentsTotal)} />
          <MetricCard icon={Activity} tone="purple" label="Frequencia no mes" value={`${monthCheckins.length} visitas`} hint="Este mes" />
        </section>

        {canSeeFinancial ? (
          <section className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${financialToneClass}`}>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/70">
                <FinancialIcon className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-bold">{financialStatus.title}</h2>
                <p className="mt-1 text-sm opacity-85">{financialStatus.description}</p>
              </div>
            </div>
            <button className="btn-secondary bg-white/80" type="button" onClick={() => setActiveTab("financial")}>
              <History className="h-4 w-4" aria-hidden />
              Ver historico financeiro
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </section>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-2">
          <StudentProfileSummary student={student} setActiveTab={setActiveTab} />
          <RecentActivities
            activities={visibleActivities}
            canShowMore={activities.length > 5}
            showAllActivities={showAllActivities}
            setShowAllActivities={setShowAllActivities}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <AttendanceSummary
            averagePerWeek={averagePerWeek}
            checkins={checkins}
            last30Checkins={last30Checkins}
            lastCheckinParts={lastCheckinParts}
            lastPresenceDays={lastPresenceDays}
            monthCheckins={monthCheckins}
            setActiveTab={setActiveTab}
          />
          <ActiveWorkoutCard activeWorkout={activeWorkout} canEditTraining={canEditTraining} setActiveTab={setActiveTab} />
        </section>

        {canSeeFinancial ? (
          <FinancialPreview
            payments={previewPayments}
            previewFilter={previewFilter}
            setActiveTab={setActiveTab}
            setPreviewFilter={setPreviewFilter}
          />
        ) : null}
      </div>

      <QuickActions student={student} canEditTraining={canEditTraining} canSeeFinancial={canSeeFinancial} setActiveTab={setActiveTab} />
    </div>
  );
}

function QuickActions({
  canEditTraining,
  canSeeFinancial,
  setActiveTab,
  student
}: {
  canEditTraining: boolean;
  canSeeFinancial: boolean;
  setActiveTab: (tab: DetailTab) => void;
  student: Student;
}) {
  return (
    <aside className="panel h-fit p-4">
      <h2 className="panel-title">Acoes rapidas</h2>
      <div className="mt-4 grid gap-2">
        {canSeeFinancial ? (
          <>
            <Link className="btn-primary w-full" href={`/app/mensalidades?student_id=${student.id}&amount=${student.monthly_fee}`}>
              <Receipt className="h-4 w-4" aria-hidden />
              Registrar mensalidade
            </Link>
            <Link className="btn-secondary w-full" href={`/app/frequencia?student_id=${student.id}`}>
              <UserCheck className="h-4 w-4" aria-hidden />
              Registrar frequencia
            </Link>
            <Link className="btn-secondary w-full" href={`/app/vendas?student_id=${student.id}`}>
              <ShoppingBag className="h-4 w-4" aria-hidden />
              Vender produto
            </Link>
          </>
        ) : null}
        {canEditTraining ? (
          <button className="btn-secondary w-full" type="button" onClick={() => setActiveTab("workouts")}>
            <Dumbbell className="h-4 w-4" aria-hidden />
            Criar ficha de treino
          </button>
        ) : null}
        {canSeeFinancial ? (
          <Link className="btn-secondary w-full" href={`/app/vendas?student_id=${student.id}&payment_method=PRAZO`}>
            <CreditCard className="h-4 w-4" aria-hidden />
            Venda parcelada
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

function StudentProfileSummary({ student, setActiveTab }: { student: Student; setActiveTab: (tab: DetailTab) => void }) {
  return (
    <section className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="panel-title">Resumo do aluno</h2>
        <button className="btn-secondary px-3 py-2" type="button" onClick={() => setActiveTab("registration")}>
          <Pencil className="h-4 w-4" aria-hidden />
          Editar
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ProfileInfo icon={Phone} label="Telefone" value={formatPhone(student.phone)} />
        <ProfileInfo icon={Calendar} label="Plano" value={student.plan} />
        <ProfileInfo icon={Mail} label="E-mail" value={student.email || "-"} />
        <ProfileInfo icon={CalendarCheck} label="Inicio do plano" value={formatDate(student.created_at)} />
        <ProfileInfo icon={UserRound} label="CPF" value={formatCpf(student.cpf)} />
        <ProfileInfo icon={CalendarClock} label="Fim do plano" value={formatDate(student.plan_end_date)} />
        <ProfileInfo icon={Calendar} label="Nascimento" value={formatDate(student.birth_date)} />
        <ProfileInfo icon={FileText} label="Observacoes" value={student.notes || "-"} />
      </div>
    </section>
  );
}

function RecentActivities({
  activities,
  canShowMore,
  setShowAllActivities,
  showAllActivities
}: {
  activities: ActivityItem[];
  canShowMore: boolean;
  setShowAllActivities: (value: boolean) => void;
  showAllActivities: boolean;
}) {
  return (
    <section className="panel p-4">
      <h2 className="panel-title">Atividades recentes</h2>
      {activities.length === 0 ? (
        <EmptyState icon={Activity} title="Nenhuma atividade recente" hint="As movimentacoes do aluno aparecerao aqui." />
      ) : (
        <div className="mt-4 space-y-3">
          {activities.map((item) => {
            const Icon = item.icon;
            const parts = formatDateTimeParts(item.at);
            return (
              <article key={item.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${activityToneClass(item.tone)}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="mt-2 h-full min-h-4 w-px bg-line" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink/55">{item.description}</p>
                    </div>
                    <p className="shrink-0 text-xs text-ink/55 sm:text-right">
                      {parts.date}
                      <br />
                      {parts.time}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
          {canShowMore ? (
            <button className="btn-ghost mx-auto text-brand" type="button" onClick={() => setShowAllActivities(!showAllActivities)}>
              {showAllActivities ? "Ver menos atividades" : "Ver todas as atividades"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function AttendanceSummary({
  averagePerWeek,
  checkins,
  last30Checkins,
  lastCheckinParts,
  lastPresenceDays,
  monthCheckins,
  setActiveTab
}: {
  averagePerWeek: number;
  checkins: CheckIn[];
  last30Checkins: CheckIn[];
  lastCheckinParts: { date: string; time: string };
  lastPresenceDays: number | null;
  monthCheckins: CheckIn[];
  setActiveTab: (tab: DetailTab) => void;
}) {
  return (
    <section className="panel p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <UserCheck className="h-6 w-6" aria-hidden />
        </div>
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <CompactStat label="Ultima presenca" value={checkins.length ? lastCheckinParts.date : "-"} hint={checkins.length ? lastCheckinParts.time : "Sem registros"} />
          <CompactStat label="Este mes" value={`${monthCheckins.length} visitas`} hint={`${last30Checkins.length} nos ultimos 30 dias`} />
          <CompactStat label="Media" value={`${averagePerWeek.toFixed(1).replace(".", ",")} / semana`} hint="Ultimos 30 dias" />
        </div>
      </div>
      {lastPresenceDays !== null && lastPresenceDays >= 15 ? (
        <div className="mt-4 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
          Aluno sem frequencia ha {lastPresenceDays} dias.
        </div>
      ) : null}
      <button className="btn-secondary mt-4 w-full" type="button" onClick={() => setActiveTab("attendance")}>
        Ver historico de frequencia
      </button>
    </section>
  );
}

function ActiveWorkoutCard({
  activeWorkout,
  canEditTraining,
  setActiveTab
}: {
  activeWorkout?: TrainingPlan;
  canEditTraining: boolean;
  setActiveTab: (tab: DetailTab) => void;
}) {
  if (!activeWorkout) {
    return (
      <section className="panel p-4">
        <EmptyState
          icon={Dumbbell}
          title="Nenhuma ficha ativa"
          hint={canEditTraining ? "Crie uma ficha de treino para este aluno." : "As fichas ativas aparecerao aqui."}
        />
        {canEditTraining ? (
          <button className="btn-primary mt-3 w-full" type="button" onClick={() => setActiveTab("workouts")}>
            <Plus className="h-4 w-4" aria-hidden />
            Criar ficha de treino
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="panel p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
            <Dumbbell className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink/55">Ficha de treino ativa</p>
            <h2 className="mt-1 text-lg font-bold text-ink">{activeWorkout.name}</h2>
            <p className="mt-1 text-sm text-ink/55">{activeWorkout.objective || "Sem objetivo cadastrado"}</p>
            <p className="mt-1 text-xs text-ink/55">
              Inicio: {formatDate(activeWorkout.start_date)} · Reavaliacao: {formatDate(activeWorkout.reassessment_date)} · {activeWorkout.exercises.length} exercicios
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:w-36">
          <Link className="btn-secondary w-full" href={`/app/fichas/${activeWorkout.id}`}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            Abrir ficha
          </Link>
          <button className="btn-secondary w-full" type="button" onClick={() => setActiveTab("workouts")}>
            <Copy className="h-4 w-4" aria-hidden />
            Clonar ficha
          </button>
        </div>
      </div>
    </section>
  );
}

function FinancialPreview({
  payments,
  previewFilter,
  setActiveTab,
  setPreviewFilter
}: {
  payments: Payment[];
  previewFilter: PaymentPreviewFilter;
  setActiveTab: (tab: DetailTab) => void;
  setPreviewFilter: (filter: PaymentPreviewFilter) => void;
}) {
  return (
    <section className="panel p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="panel-title">Historico financeiro</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {paymentPreviewFilters.map((filter) => (
              <button
                key={filter.value}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${filter.className} ${previewFilter === filter.value ? "ring-2 ring-brand/20" : ""}`}
                type="button"
                onClick={() => setPreviewFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-secondary" type="button" onClick={() => setActiveTab("financial")}>
          Ver todas
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-4">
        {payments.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhuma mensalidade encontrada" hint="Os registros financeiros do aluno aparecerao aqui." />
        ) : (
          <PaymentsTable payments={payments} compact />
        )}
      </div>
    </section>
  );
}

function FinancialTab({
  canSeeFinancial,
  filteredRows,
  financialEndDate,
  financialMethod,
  financialStartDate,
  financialStatus,
  financialType,
  installmentSales,
  installmentSalesTotal,
  openPayments,
  openPaymentsTotal,
  paidPayments,
  sales,
  salesTotal,
  setFinancialEndDate,
  setFinancialMethod,
  setFinancialStartDate,
  setFinancialStatus,
  setFinancialType
}: {
  canSeeFinancial: boolean;
  filteredRows: FinancialRow[];
  financialEndDate: string;
  financialMethod: string;
  financialStartDate: string;
  financialStatus: FinancialStatusFilter;
  financialType: FinancialTypeFilter;
  installmentSales: Sale[];
  installmentSalesTotal: number;
  openPayments: Payment[];
  openPaymentsTotal: number;
  paidPayments: Payment[];
  sales: Sale[];
  salesTotal: number;
  setFinancialEndDate: (value: string) => void;
  setFinancialMethod: (value: string) => void;
  setFinancialStartDate: (value: string) => void;
  setFinancialStatus: (value: FinancialStatusFilter) => void;
  setFinancialType: (value: FinancialTypeFilter) => void;
}) {
  if (!canSeeFinancial) {
    return <EmptyState icon={DollarSign} title="Financeiro indisponivel para este perfil" hint="Professores acessam somente dados de treino." />;
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CheckCircle2} tone="green" label="Mensalidades pagas" value={paidPayments.length} />
        <MetricCard icon={AlertTriangle} tone="orange" label="Mensalidades em aberto" value={formatMoney(openPaymentsTotal)} hint={`${openPayments.length} lancamento(s)`} />
        <MetricCard icon={ShoppingBag} tone="blue" label="Produtos comprados" value={formatMoney(salesTotal)} hint={`${sales.length} venda(s)`} />
        <MetricCard icon={CreditCard} tone="purple" label="Vendas a prazo" value={formatMoney(installmentSalesTotal)} hint={`${installmentSales.length} venda(s)`} />
      </section>

      <section className="panel p-4">
        <h2 className="panel-title">Movimentacoes financeiras</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="label" htmlFor="financial-type">Tipo</label>
            <select id="financial-type" className="field" value={financialType} onChange={(event) => setFinancialType(event.target.value as FinancialTypeFilter)}>
              <option value="TODOS">Todos</option>
              <option value="MENSALIDADE">Mensalidades</option>
              <option value="VENDA">Vendas a vista</option>
              <option value="PRAZO">Vendas a prazo</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="financial-status">Status</label>
            <select id="financial-status" className="field" value={financialStatus} onChange={(event) => setFinancialStatus(event.target.value as FinancialStatusFilter)}>
              <option value="TODOS">Todos</option>
              <option value="PAGO">Pago</option>
              <option value="PENDENTE">Pendente</option>
              <option value="ATRASADO">Vencido</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="PRAZO">A prazo</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="financial-method">Forma</label>
            <select id="financial-method" className="field" value={financialMethod} onChange={(event) => setFinancialMethod(event.target.value)}>
              <option value="TODOS">Todas</option>
              <option value="DINHEIRO">Dinheiro</option>
              <option value="PIX">PIX</option>
              <option value="CARTAO">Cartao</option>
              <option value="PRAZO">Prazo</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="financial-start">Inicio</label>
            <input id="financial-start" className="field" type="date" value={financialStartDate} onChange={(event) => setFinancialStartDate(event.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="financial-end">Fim</label>
            <input id="financial-end" className="field" type="date" value={financialEndDate} onChange={(event) => setFinancialEndDate(event.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          {filteredRows.length === 0 ? (
            <EmptyState icon={Receipt} title="Nenhuma movimentacao encontrada" hint="Ajuste os filtros para ver outros registros." />
          ) : (
            <FinancialRowsTable rows={filteredRows} />
          )}
        </div>
      </section>
    </div>
  );
}

function WorkoutsTab({
  canEditTraining,
  cloningPlanId,
  creatingPlan,
  deactivatingPlanId,
  handleClonePlan,
  handleCreatePlan,
  handleDeactivatePlan,
  planForm,
  setPlanForm,
  trainingPlans
}: {
  canEditTraining: boolean;
  cloningPlanId: number | null;
  creatingPlan: boolean;
  deactivatingPlanId: number | null;
  handleClonePlan: (plan: TrainingPlan) => void;
  handleCreatePlan: (event: FormEvent<HTMLFormElement>) => void;
  handleDeactivatePlan: (plan: TrainingPlan) => void;
  planForm: { name: string; objective: string; start_date: string; reassessment_date: string; notes: string };
  setPlanForm: (form: { name: string; objective: string; start_date: string; reassessment_date: string; notes: string }) => void;
  trainingPlans: TrainingPlan[];
}) {
  const latestPlanId = trainingPlans[0]?.id;

  return (
    <section className="space-y-4">
      {canEditTraining ? (
        <form onSubmit={handleCreatePlan} className="panel p-4">
          <div className="flex flex-col gap-1">
            <h2 className="panel-title">Criar ficha de treino</h2>
            <p className="text-sm text-ink/60">Cadastre uma nova ficha e depois adicione exercicios na tela da ficha.</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_160px_160px_auto] xl:items-end">
            <div>
              <label className="label" htmlFor="training-plan-name">Nome da ficha</label>
              <input id="training-plan-name" className="field" required value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="training-plan-objective">Objetivo</label>
              <input
                id="training-plan-objective"
                className="field"
                placeholder="Ex.: Hipertrofia"
                value={planForm.objective}
                onChange={(event) => setPlanForm({ ...planForm, objective: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="training-plan-start">Inicio</label>
              <input id="training-plan-start" className="field" type="date" value={planForm.start_date} onChange={(event) => setPlanForm({ ...planForm, start_date: event.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="training-plan-review">Reavaliacao</label>
              <input
                id="training-plan-review"
                className="field"
                type="date"
                value={planForm.reassessment_date}
                onChange={(event) => setPlanForm({ ...planForm, reassessment_date: event.target.value })}
              />
            </div>
            <button className="btn-primary w-full" type="submit" disabled={creatingPlan}>
              <Plus className="h-4 w-4" aria-hidden />
              {creatingPlan ? "Criando..." : "Criar"}
            </button>
          </div>
        </form>
      ) : null}

      {trainingPlans.length === 0 ? (
        <EmptyState icon={Dumbbell} title="Nenhuma ficha de treino cadastrada para este aluno" hint={canEditTraining ? "Crie a primeira ficha para iniciar o acompanhamento." : "As fichas do aluno aparecerao aqui."} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {trainingPlans.map((plan) => (
            <article key={plan.id} className={`panel p-4 ${plan.id === latestPlanId ? "ring-2 ring-brand/10" : ""}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-ink">{plan.name}</h2>
                    {plan.id === latestPlanId ? <span className="rounded-full bg-brand-soft px-2 py-1 text-[11px] font-bold text-brand">Principal</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink/60">{plan.objective || "Sem objetivo cadastrado"}</p>
                </div>
                <StatusBadge value={plan.is_active ? "ATIVO" : "INATIVO"} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <CompactStat label="Inicio" value={formatDate(plan.start_date)} hint="Data inicial" />
                <CompactStat label="Reavaliacao" value={formatDate(plan.reassessment_date)} hint="Proximo ciclo" />
                <CompactStat label="Exercicios" value={plan.exercises.length} hint={`${plan.exercises.filter((exercise) => exercise.is_active).length} ativos`} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Link className="btn-secondary w-full" href={`/app/fichas/${plan.id}`}>
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Abrir
                </Link>
                <Link className="btn-secondary w-full" href={`/app/fichas/${plan.id}`}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Editar
                </Link>
                {canEditTraining ? (
                  <button className="btn-secondary w-full" type="button" disabled={cloningPlanId === plan.id} onClick={() => handleClonePlan(plan)}>
                    <Copy className="h-4 w-4" aria-hidden />
                    {cloningPlanId === plan.id ? "Clonando..." : "Clonar"}
                  </button>
                ) : null}
                {canEditTraining && plan.is_active ? (
                  <button className="btn-secondary w-full text-danger" type="button" disabled={deactivatingPlanId === plan.id} onClick={() => handleDeactivatePlan(plan)}>
                    <XCircle className="h-4 w-4" aria-hidden />
                    {deactivatingPlanId === plan.id ? "Inativando..." : "Inativar"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AttendanceTab({
  attendancePeriod,
  averagePerWeek,
  canSeeFinancial,
  checkins,
  filteredCheckins,
  last30Checkins,
  lastCheckinParts,
  lastPresenceDays,
  monthCheckins,
  setAttendancePeriod,
  student
}: {
  attendancePeriod: AttendancePeriod;
  averagePerWeek: number;
  canSeeFinancial: boolean;
  checkins: CheckIn[];
  filteredCheckins: CheckIn[];
  last30Checkins: CheckIn[];
  lastCheckinParts: { date: string; time: string };
  lastPresenceDays: number | null;
  monthCheckins: CheckIn[];
  setAttendancePeriod: (period: AttendancePeriod) => void;
  student: Student;
}) {
  if (!canSeeFinancial) {
    return <EmptyState icon={UserCheck} title="Frequencia indisponivel para este perfil" hint="Este modulo fica com administracao e recepcao." />;
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={CalendarCheck} tone="blue" label="Ultima presenca" value={checkins.length ? lastCheckinParts.date : "-"} hint={checkins.length ? lastCheckinParts.time : "Sem registros"} />
        <MetricCard icon={Activity} tone="purple" label="Total no mes" value={`${monthCheckins.length} visitas`} />
        <MetricCard icon={UserCheck} tone="green" label="Ultimos 30 dias" value={`${last30Checkins.length} visitas`} />
        <MetricCard icon={ListChecks} tone="orange" label="Media semanal" value={`${averagePerWeek.toFixed(1).replace(".", ",")}`} hint="visitas/semana" />
        <MetricCard icon={AlertTriangle} tone="red" label="Dias sem frequentar" value={lastPresenceDays === null ? "-" : `${lastPresenceDays} dias`} />
      </section>

      {lastPresenceDays !== null && lastPresenceDays >= 15 ? (
        <div className="rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          {student.name} esta sem frequencia ha {lastPresenceDays} dias.
        </div>
      ) : null}

      <section className="panel p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="panel-title">Historico de check-ins</h2>
            <p className="mt-1 text-sm text-ink/60">Registros de entrada vinculados a este aluno.</p>
          </div>
          <div className="sm:w-56">
            <label className="label" htmlFor="attendance-period">Periodo</label>
            <select id="attendance-period" className="field" value={attendancePeriod} onChange={(event) => setAttendancePeriod(event.target.value as AttendancePeriod)}>
              <option value="30_DAYS">Ultimos 30 dias</option>
              <option value="MONTH">Mes atual</option>
              <option value="ALL">Todos</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          {filteredCheckins.length === 0 ? (
            <EmptyState icon={UserCheck} title="Nenhum registro de frequencia" hint="Quando a recepcao registrar entrada, o historico aparecera aqui." />
          ) : (
            <div className="desktop-table-wrap block">
              <table className="table-base min-w-[620px]">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Horario</th>
                    <th>Responsavel</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCheckins.map((checkin) => {
                    const parts = formatDateTimeParts(checkin.checked_in_at);
                    return (
                      <tr key={checkin.id}>
                        <td>{parts.date}</td>
                        <td>{parts.time}</td>
                        <td>{checkin.created_by_id ? `Usuario #${checkin.created_by_id}` : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RegistrationTab({
  handleUpdate,
  readOnly,
  saving,
  setStudent,
  student
}: {
  handleUpdate: (event: FormEvent<HTMLFormElement>) => void;
  readOnly: boolean;
  saving: boolean;
  setStudent: (student: Student) => void;
  student: Student;
}) {
  return (
    <form onSubmit={handleUpdate} className="panel p-4">
      <div className="flex flex-col gap-1">
        <h2 className="panel-title">Cadastro</h2>
        <p className="text-sm text-ink/60">Dados pessoais, plano, cobranca e observacoes.</p>
      </div>

      <section className="mt-5">
        <h3 className="text-sm font-bold text-ink">Dados pessoais</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-4">
          <Field className="md:col-span-2" label="Nome" id="edit-name">
            <input id="edit-name" className="field" disabled={readOnly} value={student.name} onChange={(event) => setStudent({ ...student, name: event.target.value })} />
          </Field>
          <Field label="Telefone" id="edit-phone">
            <input id="edit-phone" className="field" disabled={readOnly} value={student.phone} onChange={(event) => setStudent({ ...student, phone: event.target.value })} />
          </Field>
          <Field label="E-mail" id="edit-email">
            <input id="edit-email" className="field" disabled={readOnly} value={student.email || ""} onChange={(event) => setStudent({ ...student, email: event.target.value })} />
          </Field>
          <Field label="CPF" id="edit-cpf">
            <input id="edit-cpf" className="field" disabled={readOnly} value={student.cpf || ""} onChange={(event) => setStudent({ ...student, cpf: event.target.value })} />
          </Field>
          <Field label="Data de nascimento" id="edit-birth">
            <input
              id="edit-birth"
              className="field"
              disabled={readOnly}
              type="date"
              value={dateInputValue(student.birth_date)}
              onChange={(event) => setStudent({ ...student, birth_date: event.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="mt-6 border-t border-line pt-5">
        <h3 className="text-sm font-bold text-ink">Plano e cobranca</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-4">
          <Field label="Plano" id="edit-plan">
            <input id="edit-plan" className="field" disabled={readOnly} value={student.plan} onChange={(event) => setStudent({ ...student, plan: event.target.value })} />
          </Field>
          <Field label="Mensalidade (R$)" id="edit-fee">
            <input
              id="edit-fee"
              className="field"
              disabled={readOnly}
              type="number"
              min="0"
              step="0.01"
              value={student.monthly_fee}
              onChange={(event) => setStudent({ ...student, monthly_fee: event.target.value })}
            />
          </Field>
          <Field label="Dia de vencimento" id="edit-due-day">
            <input
              id="edit-due-day"
              className="field"
              disabled={readOnly}
              type="number"
              min="1"
              max="31"
              value={student.due_day}
              onChange={(event) => setStudent({ ...student, due_day: Number(event.target.value) })}
            />
          </Field>
          <Field label="Status" id="edit-status">
            <select
              id="edit-status"
              className="field"
              disabled={readOnly}
              value={student.status}
              onChange={(event) => setStudent({ ...student, status: event.target.value as StudentStatus })}
            >
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
              <option value="INADIMPLENTE">Inadimplente</option>
            </select>
          </Field>
          <Field label="Inicio do plano" id="edit-plan-start">
            <input id="edit-plan-start" className="field" disabled value={dateInputValue(student.created_at)} type="date" />
          </Field>
          <Field label="Fim do plano" id="edit-plan-end">
            <input
              id="edit-plan-end"
              className="field"
              disabled={readOnly}
              type="date"
              value={dateInputValue(student.plan_end_date)}
              onChange={(event) => setStudent({ ...student, plan_end_date: event.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="mt-6 border-t border-line pt-5">
        <h3 className="text-sm font-bold text-ink">Informacoes adicionais</h3>
        <div className="mt-3">
          <label className="label" htmlFor="edit-notes">Observacoes</label>
          <textarea
            id="edit-notes"
            className="field min-h-28"
            disabled={readOnly}
            value={student.notes || ""}
            onChange={(event) => setStudent({ ...student, notes: event.target.value })}
          />
        </div>
      </section>

      {!readOnly ? (
        <div className="mt-5 flex justify-end">
          <button className="btn-primary w-full sm:w-auto" type="submit" disabled={saving}>
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "Salvando..." : "Salvar alteracoes"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function MetricCard({
  icon: Icon,
  tone,
  label,
  value,
  hint
}: {
  icon: LucideIcon;
  tone: "red" | "blue" | "green" | "orange" | "purple";
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  const toneClass = {
    red: "bg-brand-soft text-brand",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-success-soft text-success-dark",
    orange: "bg-warning-soft text-warning",
    purple: "bg-purple-50 text-purple-700"
  }[tone];

  return (
    <article className="panel flex items-center gap-4 p-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink/45">{label}</p>
        <p className="mt-1 truncate text-lg font-bold text-ink">{value}</p>
        {hint ? <p className="mt-0.5 truncate text-xs text-ink/55">{hint}</p> : null}
      </div>
    </article>
  );
}

function ProfileInfo({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-ink/55" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-ink/50">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

function CompactStat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-1 text-base font-bold leading-tight text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink/55">{hint}</p> : null}
    </div>
  );
}

function Field({ id, label, children, className = "" }: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function PaymentsTable({ payments, compact = false }: { payments: Payment[]; compact?: boolean }) {
  return (
    <>
      <div className="mobile-card-list">
        {payments.map((payment) => (
          <MobileRecord
            key={payment.id}
            title={formatMoney(payment.amount)}
            subtitle={`Vencimento ${formatDate(payment.due_date)}`}
            badge={<StatusBadge value={payment.status} />}
          >
            <MobileRecordRow label="Pagamento" value={formatDate(payment.paid_at)} />
            <MobileRecordRow label="Forma" value={paymentMethodLabels[payment.payment_method] ?? payment.payment_method} />
            {!compact ? <MobileRecordRow label="Obs." value={payment.notes || "-"} /> : null}
          </MobileRecord>
        ))}
      </div>

      <div className="desktop-table-wrap">
        <table className="table-base min-w-[760px]">
          <thead>
            <tr>
              <th>Vencimento</th>
              <th>Pagamento</th>
              <th>Valor</th>
              <th>Forma</th>
              <th>Status</th>
              {!compact ? <th>Obs.</th> : null}
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{formatDate(payment.due_date)}</td>
                <td>{formatDate(payment.paid_at)}</td>
                <td>{formatMoney(payment.amount)}</td>
                <td>{paymentMethodLabels[payment.payment_method] ?? payment.payment_method}</td>
                <td><StatusBadge value={payment.status} /></td>
                {!compact ? <td>{payment.notes || "-"}</td> : null}
                <td className="text-ink/45">...</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FinancialRowsTable({ rows }: { rows: FinancialRow[] }) {
  return (
    <>
      <div className="mobile-card-list">
        {rows.map((row) => (
          <MobileRecord
            key={row.key}
            title={row.description}
            subtitle={formatDate(row.date)}
            badge={<StatusBadge value={row.status} />}
          >
            <MobileRecordRow label="Valor" value={formatMoney(row.amount)} />
            <MobileRecordRow label="Forma" value={paymentMethodLabels[row.method] ?? row.method} />
            <MobileRecordRow label="Tipo" value={row.type === "MENSALIDADE" ? "Mensalidade" : row.type === "PRAZO" ? "Venda a prazo" : "Venda"} />
            <MobileRecordRow label="Obs." value={row.notes || "-"} />
          </MobileRecord>
        ))}
      </div>

      <div className="desktop-table-wrap">
        <table className="table-base min-w-[920px]">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Descricao</th>
              <th>Vencimento</th>
              <th>Pagamento</th>
              <th>Valor</th>
              <th>Forma</th>
              <th>Status</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{formatDate(row.date)}</td>
                <td>{row.type === "MENSALIDADE" ? "Mensalidade" : row.type === "PRAZO" ? "Venda a prazo" : "Venda"}</td>
                <td>{row.description}</td>
                <td>{formatDate(row.dueDate)}</td>
                <td>{formatDate(row.paidAt)}</td>
                <td>{formatMoney(row.amount)}</td>
                <td>{paymentMethodLabels[row.method] ?? row.method}</td>
                <td><StatusBadge value={row.status} /></td>
                <td>{row.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
