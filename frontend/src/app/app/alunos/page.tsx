"use client";

import { FileSpreadsheet, Plus, Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { Message } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, MobileRecord, MobileRecordRow, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatMoney, getSession } from "@/lib/api";
import type { Student, StudentImportResult, StudentStatus, UserRole } from "@/lib/types";

const emptyStudent = {
  name: "",
  phone: "",
  email: "",
  cpf: "",
  birth_date: "",
  plan: "Mensal",
  plan_end_date: "",
  monthly_fee: "0",
  due_day: "10",
  status: "ATIVO" as StudentStatus,
  notes: ""
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(emptyStudent);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [role, setRole] = useState<UserRole>("RECEPCAO");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<StudentImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRole(getSession()?.user.role ?? "RECEPCAO");
  }, []);

  async function loadStudents() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    setStudents(await apiFetch<Student[]>(`/students?${params.toString()}`));
  }

  useEffect(() => {
    loadStudents()
      .catch((err) => setMessage({ text: getErrorMessage(err, "Erro ao carregar alunos."), type: "error" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch<Student>("/students", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          email: form.email || null,
          cpf: form.cpf || null,
          birth_date: form.birth_date || null,
          plan_end_date: form.plan_end_date || null,
          monthly_fee: Number(form.monthly_fee),
          due_day: Number(form.due_day),
          notes: form.notes || null
        })
      });
      setForm(emptyStudent);
      setMessage({ text: "Aluno cadastrado.", type: "success" });
      await loadStudents();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao cadastrar aluno."), type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(student: Student) {
    if (!window.confirm(`Excluir ${student.name}?`)) return;
    try {
      await apiFetch(`/students/${student.id}`, { method: "DELETE" });
      setMessage({ text: "Aluno excluido.", type: "success" });
      await loadStudents();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao excluir aluno."), type: "error" });
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile || importing) return;
    setImporting(true);
    const data = new FormData();
    data.append("file", importFile);
    try {
      const result = await apiFetch<StudentImportResult>("/students/import", {
        method: "POST",
        body: data
      });
      setImportResult(result);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = "";
      setMessage({ text: `${result.imported} alunos importados.`, type: "success" });
      await loadStudents();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao importar alunos."), type: "error" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Alunos" subtitle="Cadastro, busca e historico financeiro." />

      {message ? <Message message={message.text} type={message.type} /> : null}

      {role === "ADMIN" ? (
        <form onSubmit={handleImport} className="panel grid gap-4 p-5 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="panel-title">Importar alunos por planilha</h2>
            <p className="mt-1 text-sm text-ink/60">
              CSV ou XLSX com colunas: nome, telefone, email, cpf, data_nascimento, plano, mensalidade, vencimento, status, observacoes.
            </p>
            {importResult?.errors.length ? (
              <div className="mt-3 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
                {importResult.errors.slice(0, 4).map((error) => (
                  <p key={`${error.row}-${error.message}`}>Linha {error.row}: {error.message}</p>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label className="label" htmlFor="import-file">Arquivo</label>
              <input
                id="import-file"
                ref={importInputRef}
                className="field"
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <button className="btn-secondary" type="submit" disabled={!importFile || importing}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              {importing ? "Importando..." : "Importar"}
            </button>
          </div>
        </form>
      ) : null}

      <form onSubmit={handleCreate} className="panel p-5">
        <h2 className="panel-title">Novo aluno</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="label" htmlFor="student-name">Nome</label>
            <input id="student-name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="student-phone">Telefone</label>
            <input id="student-phone" className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="student-email">E-mail</label>
            <input id="student-email" className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="student-cpf">CPF</label>
            <input id="student-cpf" className="field" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="student-birth">Nascimento</label>
            <input id="student-birth" className="field" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="student-plan">Plano</label>
            <input id="student-plan" className="field" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="student-plan-end">Fim do plano</label>
            <input id="student-plan-end" className="field" type="date" value={form.plan_end_date} onChange={(e) => setForm({ ...form, plan_end_date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="student-fee">Mensalidade (R$)</label>
            <input id="student-fee" className="field" type="number" min="0" step="0.01" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="student-due-day">Dia de vencimento</label>
            <input id="student-due-day" className="field" type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="student-status">Status</label>
            <select id="student-status" className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
              <option value="INADIMPLENTE">Inadimplente</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="label" htmlFor="student-notes">Observacoes</label>
            <textarea id="student-notes" className="field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" type="submit" disabled={submitting}>
              <Plus className="h-4 w-4" aria-hidden />
              {submitting ? "Salvando..." : "Novo aluno"}
            </button>
          </div>
        </div>
      </form>

      <section className="panel p-5">
        <h2 className="panel-title">Lista de alunos</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px_auto]">
          <div>
            <label className="label" htmlFor="student-search">Buscar</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink/55" aria-hidden />
              <input
                id="student-search"
                className="field pl-9"
                placeholder="Nome ou telefone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="student-filter-status">Status</label>
            <select id="student-filter-status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
              <option value="INADIMPLENTE">Inadimplente</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-secondary w-full sm:w-auto" type="button" onClick={() => loadStudents()}>
              Buscar
            </button>
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <SkeletonRows rows={4} />
          ) : students.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum aluno encontrado"
              hint="Ajuste a busca ou cadastre um novo aluno no formulario acima."
            />
          ) : (
            <>
              <div className="mobile-card-list">
                {students.map((student) => (
                  <MobileRecord
                    key={student.id}
                    title={
                      <Link className="text-brand hover:underline" href={`/app/alunos/${student.id}`}>
                        {student.name}
                      </Link>
                    }
                    subtitle={student.phone}
                    badge={<StatusBadge value={student.status} />}
                    actions={
                      <>
                        <Link className="btn-secondary w-full sm:w-auto" href={`/app/alunos/${student.id}`}>
                          Detalhes
                        </Link>
                        {role === "ADMIN" ? (
                          <button
                            className="btn-secondary w-full px-3 sm:w-auto"
                            type="button"
                            aria-label={`Excluir aluno ${student.name}`}
                            title="Excluir aluno"
                            onClick={() => handleDelete(student)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            Excluir
                          </button>
                        ) : null}
                      </>
                    }
                  >
                    <MobileRecordRow label="Plano" value={student.plan} />
                    <MobileRecordRow label="Mensalidade" value={formatMoney(student.monthly_fee)} />
                    <MobileRecordRow label="Vencimento" value={`Dia ${student.due_day}`} />
                  </MobileRecord>
                ))}
              </div>

              <div className="desktop-table-wrap">
                <table className="table-base min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Telefone</th>
                      <th>Plano</th>
                      <th>Mensalidade</th>
                      <th>Status</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td className="font-semibold">
                          <Link className="text-brand hover:underline" href={`/app/alunos/${student.id}`}>
                            {student.name}
                          </Link>
                        </td>
                        <td>{student.phone}</td>
                        <td>{student.plan}</td>
                        <td>{formatMoney(student.monthly_fee)}</td>
                        <td><StatusBadge value={student.status} /></td>
                        <td>
                          {role === "ADMIN" ? (
                            <button
                              className="btn-secondary px-3"
                              type="button"
                              aria-label={`Excluir aluno ${student.name}`}
                              title="Excluir aluno"
                              onClick={() => handleDelete(student)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          ) : (
                            <span className="text-xs text-ink/55">Consulta</span>
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
      </section>
    </div>
  );
}
