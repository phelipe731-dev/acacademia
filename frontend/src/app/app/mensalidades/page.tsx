"use client";

import { AlertTriangle, CalendarClock, CalendarPlus, CheckCircle, Plus, Receipt } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Message } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, MobileRecord, MobileRecordRow, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatDate, formatMoney, getSession } from "@/lib/api";
import type {
  DefaulterReportRow,
  MonthlyPaymentsGenerateResult,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Student,
  UserRole
} from "@/lib/types";

const paymentMethods: PaymentMethod[] = ["DINHEIRO", "PIX", "CARTAO", "OUTRO"];
const paymentStatuses: PaymentStatus[] = ["PENDENTE", "PARCIAL", "PAGO", "ATRASADO", "CANCELADO"];
type PaymentSplitForm = { payment_method: PaymentMethod; amount: string };

function paymentSplitLabel(payment: Payment) {
  if (!payment.splits?.length) return payment.payment_method;
  return payment.splits
    .map((split) => `${split.payment_method} ${formatMoney(split.amount)}`)
    .join(" + ");
}

function parseSplitPrompt(value: string | null): PaymentSplitForm[] | null {
  if (value === null) return null;
  const rows = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [method, amount] = part.split(":").map((item) => item.trim());
      const upperMethod = method?.toUpperCase() as PaymentMethod;
      if (!paymentMethods.includes(upperMethod) || !amount || Number(amount.replace(",", ".")) <= 0) {
        throw new Error("Use o formato CARTAO:50,DINHEIRO:25.");
      }
      return { payment_method: upperMethod, amount: amount.replace(",", ".") };
    });
  if (rows.length === 0) throw new Error("Informe ao menos uma forma de pagamento.");
  return rows;
}

export default function PaymentsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [upcoming, setUpcoming] = useState<Payment[]>([]);
  const [defaulters, setDefaulters] = useState<DefaulterReportRow[]>([]);
  const [status, setStatus] = useState("");
  const [role, setRole] = useState<UserRole>("RECEPCAO");
  const [generationMonth, setGenerationMonth] = useState(today.slice(0, 7));
  const [generationResult, setGenerationResult] = useState<MonthlyPaymentsGenerateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [form, setForm] = useState({
    student_id: "",
    amount: "",
    due_date: today,
    paid_at: today,
    status: "PENDENTE" as PaymentStatus,
    payment_method: "PIX" as PaymentMethod,
    splits: [{ payment_method: "PIX" as PaymentMethod, amount: "" }],
    notes: ""
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedStudentId = params.get("student_id");
    const amount = params.get("amount");
    if (!selectedStudentId && !amount) return;
    setForm((current) => ({
      ...current,
      student_id: selectedStudentId || current.student_id,
      amount: amount || current.amount
    }));
  }, []);

  async function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const [studentsData, paymentsData, upcomingData, defaultersData] = await Promise.all([
      apiFetch<Student[]>("/students"),
      apiFetch<Payment[]>(`/payments?${params.toString()}`),
      apiFetch<Payment[]>("/payments/upcoming?days=10"),
      apiFetch<DefaulterReportRow[]>("/payments/defaulters")
    ]);
    setStudents(studentsData);
    setPayments(paymentsData);
    setUpcoming(upcomingData);
    setDefaulters(defaultersData);
  }

  useEffect(() => {
    setRole(getSession()?.user.role ?? "RECEPCAO");
    load()
      .catch((err) => setMessage({ text: getErrorMessage(err, "Erro ao carregar mensalidades."), type: "error" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch<Payment>("/payments", {
        method: "POST",
        body: JSON.stringify({
          student_id: Number(form.student_id),
          amount: Number(form.amount),
          due_date: form.due_date,
          paid_at: form.status === "PAGO" ? form.paid_at : null,
          status: form.status,
          payment_method: form.payment_method,
          splits: form.status === "PAGO"
            ? form.splits.map((split) => ({ payment_method: split.payment_method, amount: Number(split.amount) }))
            : null,
          notes: form.notes || null
        })
      });
      setMessage({ text: "Mensalidade registrada.", type: "success" });
      setForm({ ...form, amount: "", splits: [{ payment_method: form.payment_method, amount: "" }], notes: "" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao registrar mensalidade."), type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid(payment: Payment) {
    if (payingId !== null) return;
    const balance = Number(payment.balance_due ?? payment.amount);
    const amountText = window.prompt("Valor recebido agora", balance.toFixed(2));
    if (amountText === null) return;
    const amount = Number(amountText.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      setMessage({ text: `Informe um valor entre R$ 0,01 e R$ ${balance.toFixed(2)}.`, type: "error" });
      return;
    }
    const method = window.prompt("Forma de pagamento: PIX, DINHEIRO, CARTAO ou OUTRO", payment.payment_method);
    if (method === null) return;
    const normalizedMethod = method.toUpperCase() as PaymentMethod;
    if (!paymentMethods.includes(normalizedMethod)) {
      setMessage({ text: "Forma de pagamento invalida.", type: "error" });
      return;
    }
    setPayingId(payment.id);
    try {
      await apiFetch<Payment>(`/payments/${payment.id}/receipts`, {
        method: "POST",
        body: JSON.stringify({
          paid_at: today,
          payment_method: normalizedMethod,
          amount,
        })
      });
      setMessage({ text: amount < balance ? "Recebimento parcial registrado." : "Pagamento confirmado.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao confirmar pagamento."), type: "error" });
    } finally {
      setPayingId(null);
    }
  }

  function updateSplit(index: number, patch: Partial<PaymentSplitForm>) {
    setForm((current) => ({
      ...current,
      splits: current.splits.map((split, splitIndex) => splitIndex === index ? { ...split, ...patch } : split)
    }));
  }

  function addSplit() {
    setForm((current) => ({
      ...current,
      splits: [...current.splits, { payment_method: "DINHEIRO", amount: "" }]
    }));
  }

  function removeSplit(index: number) {
    setForm((current) => ({
      ...current,
      splits: current.splits.length === 1 ? current.splits : current.splits.filter((_, splitIndex) => splitIndex !== index)
    }));
  }

  async function generateMonthly() {
    if (generating) return;
    setGenerating(true);
    const [year, month] = generationMonth.split("-").map(Number);
    try {
      const result = await apiFetch<MonthlyPaymentsGenerateResult>("/payments/generate-monthly", {
        method: "POST",
        body: JSON.stringify({ year, month })
      });
      setGenerationResult(result);
      setMessage({ text: `${result.generated} mensalidades geradas. ${result.skipped_existing} ja existiam.`, type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao gerar mensalidades."), type: "error" });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Mensalidades" subtitle="Pagamentos, pendencias e vencimentos proximos." />

      {message ? <Message message={message.text} type={message.type} /> : null}

      {role === "ADMIN" ? (
        <section className="panel grid gap-4 p-5 md:grid-cols-[1fr_180px_auto]">
          <div>
            <h2 className="panel-title">Geracao automatica</h2>
            <p className="mt-1 text-sm text-ink/60">Cria mensalidades pendentes para alunos ativos, sem duplicar o mesmo vencimento.</p>
            {generationResult ? (
              <p className="mt-2 text-sm font-semibold text-brand">
                {generationResult.generated} criadas · {generationResult.skipped_existing} ja existentes
              </p>
            ) : null}
          </div>
          <div>
            <label className="label" htmlFor="generation-month">Mes de referencia</label>
            <input
              id="generation-month"
              className="field"
              type="month"
              value={generationMonth}
              onChange={(event) => setGenerationMonth(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button className="btn-secondary w-full sm:w-auto" type="button" onClick={generateMonthly} disabled={generating}>
              <CalendarPlus className="h-4 w-4" aria-hidden />
              {generating ? "Gerando..." : "Gerar mes"}
            </button>
          </div>
        </section>
      ) : null}

      <form onSubmit={handleCreate} className="panel p-5">
        <h2 className="panel-title">Registrar mensalidade</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="label" htmlFor="payment-student">Aluno</label>
            <select id="payment-student" className="field" required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
              <option value="">Selecione o aluno</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>{student.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="payment-amount">Valor (R$)</label>
            <input
              id="payment-amount"
              className="field"
              required
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) => setForm({
                ...form,
                amount: e.target.value,
                splits: form.splits.length === 1 ? [{ ...form.splits[0], amount: e.target.value }] : form.splits
              })}
            />
          </div>
          <div>
            <label className="label" htmlFor="payment-due-date">Vencimento</label>
            <input id="payment-due-date" className="field" required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="payment-paid-at">Data de pagamento</label>
            <input id="payment-paid-at" className="field" type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} disabled={form.status !== "PAGO"} />
          </div>
          <div>
            <label className="label" htmlFor="payment-status">Status</label>
            <select
              id="payment-status"
              className="field"
              value={form.status}
              onChange={(e) => setForm({
                ...form,
                status: e.target.value as PaymentStatus,
                splits: e.target.value === "PAGO" && form.splits.length === 1
                  ? [{ ...form.splits[0], amount: form.splits[0].amount || form.amount }]
                  : form.splits
              })}
            >
              {paymentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="payment-method">Forma de pagamento</label>
            <select id="payment-method" className="field" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod, splits: [{ payment_method: e.target.value as PaymentMethod, amount: form.amount }] })}>
              {paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="payment-notes">Observacao</label>
            <input id="payment-notes" className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" type="submit" disabled={submitting}>
              <Plus className="h-4 w-4" aria-hidden />
              {submitting ? "Registrando..." : "Registrar"}
            </button>
          </div>
        </div>
        {form.status === "PAGO" ? (
          <div className="mt-4 rounded-lg border border-line p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">Composicao do pagamento</h3>
              <button className="btn-secondary px-3" type="button" onClick={addSplit}>
                <Plus className="h-4 w-4" aria-hidden />
                Forma
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {form.splits.map((split, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                  <select
                    className="field"
                    aria-label="Forma de pagamento"
                    value={split.payment_method}
                    onChange={(event) => updateSplit(index, { payment_method: event.target.value as PaymentMethod })}
                  >
                    {paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <input
                    className="field"
                    aria-label="Valor da forma de pagamento"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={split.amount}
                    onChange={(event) => updateSplit(index, { amount: event.target.value })}
                    placeholder="Valor"
                    required
                  />
                  <button className="btn-secondary px-3" type="button" onClick={() => removeSplit(index)} disabled={form.splits.length === 1}>
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </form>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="panel p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="panel-title">Lancamentos</h2>
            <div>
              <label className="label" htmlFor="payments-filter-status">Filtrar por status</label>
              <select id="payments-filter-status" className="field sm:max-w-[220px]" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Ativos</option>
                {paymentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>
          {loading ? (
            <SkeletonRows rows={4} />
          ) : payments.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhuma mensalidade encontrada"
              hint="Ajuste o filtro de status ou registre uma nova mensalidade."
            />
          ) : (
            <>
              <div className="mobile-card-list">
                {payments.map((payment) => {
                  const canPay = payment.status !== "PAGO" && payment.status !== "CANCELADO";
                  const studentName = payment.student?.name ?? payment.student_id;
                  return (
                    <MobileRecord
                      key={payment.id}
                      title={studentName}
                      subtitle={`Lancamento #${payment.id}`}
                      badge={<StatusBadge value={payment.status} />}
                      actions={
                        canPay ? (
                          <button
                            className="btn-secondary w-full sm:w-auto"
                            type="button"
                            aria-label={`Marcar como pago: ${studentName}`}
                            title="Marcar como pago"
                            onClick={() => markPaid(payment)}
                            disabled={payingId !== null}
                          >
                            <CheckCircle className="h-4 w-4" aria-hidden />
                            Marcar pago
                          </button>
                        ) : undefined
                      }
                    >
                      <MobileRecordRow label="Valor" value={formatMoney(payment.amount)} />
                      <MobileRecordRow label="Vencimento" value={formatDate(payment.due_date)} />
                      <MobileRecordRow label="Pagamento" value={formatDate(payment.paid_at)} />
                      <MobileRecordRow label="Forma" value={paymentSplitLabel(payment)} />
                    </MobileRecord>
                  );
                })}
              </div>

              <div className="desktop-table-wrap">
                <table className="table-base min-w-[880px]">
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Vencimento</th>
                      <th>Pagamento</th>
                      <th>Valor</th>
                      <th>Forma</th>
                      <th>Status</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="font-semibold">{payment.student?.name ?? payment.student_id}</td>
                        <td>{formatDate(payment.due_date)}</td>
                        <td>{formatDate(payment.paid_at)}</td>
                        <td>{formatMoney(payment.amount)}</td>
                        <td className="max-w-[220px] text-xs text-ink/65">{paymentSplitLabel(payment)}</td>
                        <td><StatusBadge value={payment.status} /></td>
                        <td>
                          {payment.status !== "PAGO" && payment.status !== "CANCELADO" ? (
                            <button
                              className="btn-secondary px-3"
                              type="button"
                              aria-label={`Marcar como pago: ${payment.student?.name ?? payment.student_id}`}
                              title="Marcar como pago"
                              onClick={() => markPaid(payment)}
                              disabled={payingId !== null}
                            >
                              <CheckCircle className="h-4 w-4" aria-hidden />
                            </button>
                          ) : (
                            <span className="text-xs text-ink/55">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="panel-title">Inadimplentes</h2>
            <div className="mt-4 space-y-2">
              {loading ? (
                <SkeletonRows rows={3} height="h-14" />
              ) : defaulters.length === 0 ? (
                <EmptyState icon={AlertTriangle} title="Nenhum aluno inadimplente" />
              ) : (
                defaulters.map((item) => (
                  <div key={item.student_id} className="rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70">
                    <p className="text-sm font-semibold text-ink">{item.student_name}</p>
                    <p className="text-xs text-ink/55">{item.phone} · {formatMoney(item.overdue_amount)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="panel p-5">
            <h2 className="panel-title">Vencimentos proximos</h2>
            <div className="mt-4 space-y-2">
              {loading ? (
                <SkeletonRows rows={3} height="h-14" />
              ) : upcoming.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Nenhum vencimento nos proximos dias" />
              ) : (
                upcoming.map((item) => (
                  <div key={item.id} className="rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70">
                    <p className="text-sm font-semibold text-ink">{item.student?.name}</p>
                    <p className="text-xs text-ink/55">{formatDate(item.due_date)} · {formatMoney(item.amount)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
