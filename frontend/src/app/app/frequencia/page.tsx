"use client";

import { CheckCircle, Moon, Search, UserCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Message } from "@/components/Message";
import { EmptyState, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatDate, formatDateTime } from "@/lib/api";
import type { CheckIn, InactiveStudentRow, Student } from "@/lib/types";

export default function FrequenciaPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [today, setToday] = useState<CheckIn[]>([]);
  const [inactive, setInactive] = useState<InactiveStudentRow[]>([]);
  const [inactiveDays, setInactiveDays] = useState(15);
  const [search, setSearch] = useState("");
  const [registeringId, setRegisteringId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);

  async function load() {
    const [studentsData, todayData, inactiveData] = await Promise.all([
      apiFetch<Student[]>("/students?status=ATIVO"),
      apiFetch<CheckIn[]>("/checkins/today"),
      apiFetch<InactiveStudentRow[]>(`/students/inactive?days=${inactiveDays}`)
    ]);
    setStudents(studentsData);
    setToday(todayData);
    setInactive(inactiveData);
  }

  useEffect(() => {
    load()
      .catch((err) => setMessage({ text: getErrorMessage(err, "Erro ao carregar frequencia."), type: "error" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inactiveDays]);

  const checkedInToday = useMemo(() => new Set(today.map((item) => item.student_id)), [today]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students.slice(0, 8);
    return students
      .filter((student) => student.name.toLowerCase().includes(term) || student.phone.includes(term))
      .slice(0, 8);
  }, [students, search]);

  async function registerCheckin(student: Student) {
    if (registeringId !== null) return;
    setRegisteringId(student.id);
    setMessage(null);
    try {
      await apiFetch<CheckIn>("/checkins", {
        method: "POST",
        body: JSON.stringify({ student_id: student.id })
      });
      setMessage({ text: `Entrada registrada: ${student.name}.`, type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao registrar entrada."), type: "error" });
    } finally {
      setRegisteringId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Frequencia" subtitle="Registre a entrada dos alunos e acompanhe quem esta sumido." />

      {message ? <Message message={message.text} type={message.type} /> : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="panel p-5">
            <h2 className="panel-title">Registrar entrada</h2>
            <div className="mt-4">
              <label className="label" htmlFor="checkin-search">Buscar aluno</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink/55" aria-hidden />
                <input
                  id="checkin-search"
                  className="field pl-9"
                  placeholder="Nome ou telefone"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {loading ? (
                <SkeletonRows rows={4} />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Nenhum aluno encontrado"
                  hint="Ajuste o termo de busca por nome ou telefone."
                />
              ) : (
                filtered.map((student) => {
                  const already = checkedInToday.has(student.id);
                  return (
                    <div
                      key={student.id}
                      className="flex flex-col gap-3 rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{student.name}</p>
                        <p className="text-xs text-ink/55">{student.phone} · {student.plan}</p>
                      </div>
                      {already ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-success-dark">
                          <CheckCircle className="h-4 w-4" aria-hidden /> Presente
                        </span>
                      ) : (
                        <button
                          className="btn-primary w-full px-3 sm:w-auto"
                          type="button"
                          aria-label={`Registrar entrada de ${student.name}`}
                          onClick={() => registerCheckin(student)}
                          disabled={registeringId !== null}
                        >
                          <UserCheck className="h-4 w-4" aria-hidden />
                          Entrada
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="panel-title">Presencas de hoje</h2>
              <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand-dark">{today.length}</span>
            </div>
            <div className="mt-4 space-y-2">
              {loading ? (
                <SkeletonRows rows={3} height="h-12" />
              ) : today.length === 0 ? (
                <EmptyState
                  icon={UserCheck}
                  title="Nenhuma entrada registrada hoje"
                  hint="Use a busca acima para registrar a primeira entrada do dia."
                />
              ) : (
                today.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1 rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="text-sm font-semibold text-ink">{item.student?.name ?? item.student_id}</p>
                    <p className="text-xs text-ink/55">{formatDateTime(item.checked_in_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="panel p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="panel-title">Alunos sumidos</h2>
            <div>
              <label className="label" htmlFor="inactive-days">Dias sem vir</label>
              <select
                id="inactive-days"
                className="field sm:max-w-[140px]"
                value={inactiveDays}
                onChange={(event) => setInactiveDays(Number(event.target.value))}
              >
                <option value={7}>7+ dias</option>
                <option value={15}>15+ dias</option>
                <option value={30}>30+ dias</option>
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink/55">Quem sumiu tende a cancelar — vale um contato.</p>
          <div className="mt-4 space-y-2">
            {loading ? (
              <SkeletonRows rows={3} height="h-14" />
            ) : inactive.length === 0 ? (
              <EmptyState
                icon={Moon}
                title="Ninguem sumido nesse periodo"
                hint="Otimo sinal! Todos os alunos ativos apareceram recentemente."
              />
            ) : (
              inactive.map((row) => (
                <div key={row.student_id} className="rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{row.name}</p>
                    <span className="text-xs font-bold text-warning">{row.days_since} dias</span>
                  </div>
                  <p className="text-xs text-ink/55">
                    {row.phone} · ultima vez: {row.last_checkin ? formatDate(row.last_checkin) : "nunca veio"}
                  </p>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
