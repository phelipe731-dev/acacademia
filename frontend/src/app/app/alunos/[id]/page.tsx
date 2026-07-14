"use client";

import { Dumbbell, ExternalLink, Plus, Receipt, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { Message } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, MobileRecord, MobileRecordRow, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatDate, formatMoney, getSession } from "@/lib/api";
import type { Payment, Student, StudentStatus, TrainingPlan, UserRole } from "@/lib/types";

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // No Next.js 16, `params` é uma Promise; `use()` a resolve no Client Component.
  const { id } = use(params);
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [trainingPlans, setTrainingPlans] = useState<TrainingPlan[]>([]);
  const [role, setRole] = useState<UserRole>("RECEPCAO");
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: "Ficha A",
    objective: "",
    start_date: new Date().toISOString().slice(0, 10),
    reassessment_date: "",
    notes: ""
  });

  async function load(currentRole = role) {
    const [studentData, paymentsData, trainingData] = await Promise.all([
      apiFetch<Student>(`/students/${id}`),
      currentRole === "PROFESSOR" ? Promise.resolve([]) : apiFetch<Payment[]>(`/students/${id}/payments`),
      apiFetch<TrainingPlan[]>(`/students/${id}/training-plans`)
    ]);
    setStudent(studentData);
    setPayments(paymentsData);
    setTrainingPlans(trainingData);
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
      router.push(`/app/fichas/${plan.id}`);
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao criar ficha de treino."), type: "error" });
    } finally {
      setCreatingPlan(false);
    }
  }

  if (!student) {
    if (message?.type === "error") return <Message message={message.text} type="error" />;
    return (
      <div className="space-y-6">
        <PageHeader title="Aluno" subtitle="Carregando dados do aluno..." />
        <div className="panel p-5">
          <SkeletonRows rows={4} />
        </div>
        <div className="panel p-5">
          <SkeletonRows rows={4} height="h-10" />
        </div>
      </div>
    );
  }

  const readOnly = role !== "ADMIN";
  const canEditTraining = role === "ADMIN" || role === "PROFESSOR";

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title={student.name} subtitle="Dados cadastrais, fichas de treino e historico financeiro.">
        <StatusBadge value={student.status} />
      </PageHeader>

      {message ? <Message message={message.text} type={message.type} /> : null}

      <form onSubmit={handleUpdate} className="panel p-5">
        <h2 className="panel-title">Dados do aluno</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="label" htmlFor="edit-name">Nome</label>
            <input id="edit-name" className="field" disabled={readOnly} value={student.name} onChange={(e) => setStudent({ ...student, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-phone">Telefone</label>
            <input id="edit-phone" className="field" disabled={readOnly} value={student.phone} onChange={(e) => setStudent({ ...student, phone: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-email">E-mail</label>
            <input id="edit-email" className="field" disabled={readOnly} value={student.email || ""} onChange={(e) => setStudent({ ...student, email: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-cpf">CPF</label>
            <input id="edit-cpf" className="field" disabled={readOnly} value={student.cpf || ""} onChange={(e) => setStudent({ ...student, cpf: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-birth">Nascimento</label>
            <input id="edit-birth" className="field" disabled={readOnly} type="date" value={student.birth_date || ""} onChange={(e) => setStudent({ ...student, birth_date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-plan">Plano</label>
            <input id="edit-plan" className="field" disabled={readOnly} value={student.plan} onChange={(e) => setStudent({ ...student, plan: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-plan-end">Fim do plano</label>
            <input id="edit-plan-end" className="field" disabled={readOnly} type="date" value={student.plan_end_date || ""} onChange={(e) => setStudent({ ...student, plan_end_date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-fee">Mensalidade (R$)</label>
            <input id="edit-fee" className="field" disabled={readOnly} type="number" min="0" step="0.01" value={student.monthly_fee} onChange={(e) => setStudent({ ...student, monthly_fee: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-due-day">Dia de vencimento</label>
            <input id="edit-due-day" className="field" disabled={readOnly} type="number" min="1" max="31" value={student.due_day} onChange={(e) => setStudent({ ...student, due_day: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-status">Status</label>
            <select id="edit-status" className="field" disabled={readOnly} value={student.status} onChange={(e) => setStudent({ ...student, status: e.target.value as StudentStatus })}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
              <option value="INADIMPLENTE">Inadimplente</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="label" htmlFor="edit-notes">Observacoes</label>
            <textarea id="edit-notes" className="field" rows={2} disabled={readOnly} value={student.notes || ""} onChange={(e) => setStudent({ ...student, notes: e.target.value })} />
          </div>
          {role === "ADMIN" ? (
            <div className="flex items-end">
              <button className="btn-primary w-full" type="submit" disabled={saving}>
                <Save className="h-4 w-4" aria-hidden />
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          ) : null}
        </div>
      </form>

      <section className="panel p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="panel-title">Fichas de treino</h2>
            <p className="mt-1 text-sm text-ink/60">Fichas digitais vinculadas a este aluno.</p>
          </div>
          {canEditTraining ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand-dark">
              <Dumbbell className="h-4 w-4" aria-hidden />
              Edicao liberada
            </span>
          ) : null}
        </div>

        {canEditTraining ? (
          <form onSubmit={handleCreatePlan} className="mt-4 grid gap-3 rounded-lg border border-line bg-paper/60 p-3.5 md:grid-cols-[1fr_1fr_160px_160px_auto] md:items-end">
            <div>
              <label className="label" htmlFor="training-plan-name">Nome da ficha</label>
              <input
                id="training-plan-name"
                className="field"
                required
                value={planForm.name}
                onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })}
              />
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
              <input
                id="training-plan-start"
                className="field"
                type="date"
                value={planForm.start_date}
                onChange={(event) => setPlanForm({ ...planForm, start_date: event.target.value })}
              />
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
          </form>
        ) : null}

        <div className="mt-4">
          {trainingPlans.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="Nenhuma ficha cadastrada"
              hint={canEditTraining ? "Crie a primeira ficha de treino no formulario acima." : "As fichas do aluno aparecerao aqui."}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {trainingPlans.map((plan) => (
                <article key={plan.id} className="rounded-lg border border-line bg-surface p-3.5 transition hover:bg-paper/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{plan.name}</p>
                      <p className="mt-1 text-xs text-ink/55">
                        {plan.objective || "Sem objetivo"} · {plan.exercises.length} exercicios
                      </p>
                    </div>
                    <StatusBadge value={plan.is_active ? "ATIVO" : "INATIVO"} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">Inicio</p>
                      <p className="font-semibold text-ink/85">{formatDate(plan.start_date)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">Reavaliacao</p>
                      <p className="font-semibold text-ink/85">{formatDate(plan.reassessment_date)}</p>
                    </div>
                  </div>
                  <Link className="btn-secondary mt-3 w-full" href={`/app/fichas/${plan.id}`}>
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Abrir ficha
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {role !== "PROFESSOR" ? (
      <section className="panel p-5">
        <h2 className="panel-title">Historico financeiro</h2>
        <div className="mt-4">
          {payments.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhuma mensalidade registrada"
              hint="As mensalidades deste aluno aparecerao aqui."
            />
          ) : (
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
                    <MobileRecordRow label="Forma" value={payment.payment_method} />
                  </MobileRecord>
                ))}
              </div>

              <div className="desktop-table-wrap">
                <table className="table-base min-w-[680px]">
                  <thead>
                    <tr>
                      <th>Vencimento</th>
                      <th>Pagamento</th>
                      <th>Valor</th>
                      <th>Forma</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDate(payment.due_date)}</td>
                        <td>{formatDate(payment.paid_at)}</td>
                        <td>{formatMoney(payment.amount)}</td>
                        <td>{payment.payment_method}</td>
                        <td><StatusBadge value={payment.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
      ) : null}
    </div>
  );
}
