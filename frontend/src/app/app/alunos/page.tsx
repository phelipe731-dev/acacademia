"use client";

import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Users,
  X
} from "lucide-react";
import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Message } from "@/components/Message";
import { EmptyState, MobileRecord, MobileRecordRow, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatMoney, getSession } from "@/lib/api";
import type { Student, StudentImportResult, StudentStatus, UserRole } from "@/lib/types";

type StudentFilterStatus = "" | StudentStatus | "SUSPENSO";

interface StudentFormState {
  name: string;
  phone: string;
  email: string;
  cpf: string;
  birth_date: string;
  plan: string;
  plan_end_date: string;
  monthly_fee: string;
  due_day: string;
  status: StudentStatus;
  notes: string;
}

const pageSize = 10;

const statusFilterOptions: Array<{ value: StudentFilterStatus; label: string }> = [
  { value: "", label: "Todos" },
  { value: "ATIVO", label: "Ativo" },
  { value: "INATIVO", label: "Inativo" },
  { value: "SUSPENSO", label: "Suspenso" },
  { value: "INADIMPLENTE", label: "Vencido" }
];

const studentStatusOptions: Array<{ value: StudentStatus; label: string }> = [
  { value: "ATIVO", label: "Ativo" },
  { value: "INATIVO", label: "Inativo" },
  { value: "INADIMPLENTE", label: "Vencido" }
];

function createEmptyStudentForm(): StudentFormState {
  return {
    name: "",
    phone: "",
    email: "",
    cpf: "",
    birth_date: "",
    plan: "Mensal",
    plan_end_date: "",
    monthly_fee: "0",
    due_day: "10",
    status: "ATIVO",
    notes: ""
  };
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatCpf(value?: string | null): string {
  const digits = onlyDigits(value ?? "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value?: string | null): string {
  const digits = onlyDigits(value ?? "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("pt-BR");
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase("pt-BR");
}

function todayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateToInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function nextDueDate(dueDay: number, reference = todayStart()): Date {
  const normalizedDay = Math.min(Math.max(Number(dueDay) || 1, 1), 31);
  const daysInMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
  let dueDate = new Date(reference.getFullYear(), reference.getMonth(), Math.min(normalizedDay, daysInMonth));
  if (dueDate < reference) {
    const nextMonthDays = new Date(reference.getFullYear(), reference.getMonth() + 2, 0).getDate();
    dueDate = new Date(reference.getFullYear(), reference.getMonth() + 1, Math.min(normalizedDay, nextMonthDays));
  }
  return dueDate;
}

function daysUntil(date: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((date.getTime() - todayStart().getTime()) / millisecondsPerDay);
}

function dueInfo(student: Student): { label: string; caption: string; tone: "default" | "warning" | "danger" } {
  const due = nextDueDate(student.due_day);
  const days = daysUntil(due);
  const tone = student.status === "INADIMPLENTE" ? "danger" : days <= 10 ? "warning" : "default";
  return {
    label: formatDateLabel(due),
    caption: student.status === "INADIMPLENTE" ? "Pendencia" : `Dia ${student.due_day}`,
    tone
  };
}

function studentMatchesSearch(student: Student, term: string): boolean {
  const normalizedTerm = normalizeText(term.trim());
  const numericTerm = onlyDigits(term);
  if (!normalizedTerm && !numericTerm) return true;

  const text = normalizeText([student.name, student.phone, student.cpf ?? "", student.plan].join(" "));
  const numbers = onlyDigits([student.phone, student.cpf ?? ""].join(" "));

  return text.includes(normalizedTerm) || (numericTerm.length > 0 && numbers.includes(numericTerm));
}

function isFormDirty(form: StudentFormState): boolean {
  return JSON.stringify(form) !== JSON.stringify(createEmptyStudentForm());
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<StudentFilterStatus>("");
  const [plan, setPlan] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState<StudentFormState>(createEmptyStudentForm);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [role, setRole] = useState<UserRole>("RECEPCAO");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<StudentImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      setStudents(await apiFetch<Student[]>("/students"));
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao carregar alunos."), type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRole(getSession()?.user.role ?? "RECEPCAO");
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, status, plan]);

  useEffect(() => {
    if (!studentModalOpen && !importModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (importModalOpen) {
        closeImportModal();
        return;
      }
      if (studentModalOpen) {
        closeStudentModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  });

  const planOptions = useMemo(() => {
    const options = new Set(students.map((student) => student.plan.trim()).filter(Boolean));
    options.add("Mensal");
    return Array.from(options).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [students]);

  const summary = useMemo(() => {
    const active = students.filter((student) => student.status === "ATIVO").length;
    const inactive = students.filter((student) => student.status === "INATIVO").length;
    const expiring = students.filter((student) => {
      if (student.status !== "ATIVO") return false;
      const days = daysUntil(nextDueDate(student.due_day));
      return days >= 0 && days <= 10;
    }).length;

    return {
      total: students.length,
      active,
      expiring,
      inactive
    };
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      if (!studentMatchesSearch(student, debouncedSearch)) return false;
      if (status === "SUSPENSO") return false;
      if (status && student.status !== status) return false;
      if (plan && student.plan !== plan) return false;
      return true;
    });
  }, [students, debouncedSearch, status, plan]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = filteredStudents.length === 0 ? 0 : (safePage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, filteredStudents.length);
  const visibleStudents = filteredStudents.slice(pageStartIndex, pageEndIndex);
  const hasActiveFilters = Boolean(debouncedSearch || status || plan);

  const paginationPages = useMemo(() => {
    const candidates = new Set([1, totalPages, safePage - 1, safePage, safePage + 1]);
    return Array.from(candidates)
      .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
      .sort((a, b) => a - b);
  }, [safePage, totalPages]);

  function closeStudentModal(force = false) {
    if (!force && isFormDirty(form) && !window.confirm("Descartar os dados do novo aluno?")) return;
    setStudentModalOpen(false);
    setForm(createEmptyStudentForm());
  }

  function openStudentModal() {
    setMessage(null);
    setForm(createEmptyStudentForm());
    setStudentModalOpen(true);
  }

  function closeImportModal() {
    setImportModalOpen(false);
    setImportFile(null);
    setImportResult(null);
    if (importInputRef.current) importInputRef.current.value = "";
  }

  function openImportModal() {
    setMessage(null);
    setImportResult(null);
    setImportModalOpen(true);
  }

  function resetFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setPlan("");
    setCurrentPage(1);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch<Student>("/students", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          phone: onlyDigits(form.phone) || form.phone.trim(),
          email: form.email.trim() || null,
          cpf: onlyDigits(form.cpf) || null,
          birth_date: form.birth_date || null,
          plan: form.plan.trim(),
          plan_end_date: form.plan_end_date || null,
          monthly_fee: Number(String(form.monthly_fee).replace(",", ".")),
          due_day: Number(form.due_day),
          status: form.status,
          notes: form.notes.trim() || null
        })
      });
      setMessage({ text: "Aluno cadastrado.", type: "success" });
      closeStudentModal(true);
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
    setMessage(null);
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
    <div className="space-y-4 animate-fade-up">
      <PageHeader title="Alunos" subtitle="Gerencie os alunos da academia.">
        {role === "ADMIN" ? (
          <button className="btn-secondary w-full sm:w-auto" type="button" onClick={openImportModal}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Importar planilha
          </button>
        ) : null}
        <button className="btn-primary w-full sm:w-auto" type="button" onClick={openStudentModal}>
          <Plus className="h-4 w-4" aria-hidden />
          Novo aluno
        </button>
      </PageHeader>

      {message ? <Message message={message.text} type={message.type} /> : null}

      <section className="panel p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_170px_180px_auto] lg:items-end">
          <div>
            <label className="sr-only" htmlFor="student-search">Buscar aluno</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/45" aria-hidden />
              <input
                id="student-search"
                className="field h-11 pl-9"
                placeholder="Buscar por nome, CPF ou telefone..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="sr-only" htmlFor="student-filter-status">Status</label>
            <select
              id="student-filter-status"
              className="field h-11"
              value={status}
              onChange={(event) => setStatus(event.target.value as StudentFilterStatus)}
            >
              {statusFilterOptions.map((option) => (
                <option key={option.value || "TODOS"} value={option.value}>
                  Status: {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="sr-only" htmlFor="student-filter-plan">Plano</label>
            <select id="student-filter-plan" className="field h-11" value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="">Plano: Todos</option>
              {planOptions.map((option) => (
                <option key={option} value={option}>
                  Plano: {option}
                </option>
              ))}
            </select>
          </div>

          <button className="btn-secondary h-11" type="button" onClick={resetFilters} disabled={!hasActiveFilters}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filtros
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Users} tone="blue" label="Total de alunos" value={summary.total} />
        <SummaryCard icon={UserCheck} tone="green" label="Alunos ativos" value={summary.active} />
        <SummaryCard icon={CalendarClock} tone="yellow" label="Vencendo em 10 dias" value={summary.expiring} />
        <SummaryCard icon={UserX} tone="red" label="Alunos inativos" value={summary.inactive} />
      </section>

      <section className="panel overflow-hidden">
        {loading ? (
          <div className="p-5">
            <SkeletonRows rows={6} />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Users}
              title="Nenhum aluno encontrado"
              hint={hasActiveFilters ? "Ajuste os filtros ou limpe a busca para ver mais alunos." : "Cadastre um novo aluno para iniciar a lista."}
            />
          </div>
        ) : (
          <>
            <div className="mobile-card-list p-4">
              {visibleStudents.map((student) => {
                const due = dueInfo(student);
                return (
                  <MobileRecord
                    key={student.id}
                    title={
                      <Link className="text-brand hover:underline" href={`/app/alunos/${student.id}`}>
                        {student.name}
                      </Link>
                    }
                    subtitle={student.cpf ? formatCpf(student.cpf) : formatPhone(student.phone)}
                    badge={<StudentStatusBadge value={student.status} />}
                    actions={
                      <>
                        <Link className="btn-secondary w-full sm:w-auto" href={`/app/alunos/${student.id}`}>
                          <Eye className="h-4 w-4" aria-hidden />
                          Visualizar
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
                    <MobileRecordRow label="Telefone" value={formatPhone(student.phone)} />
                    <MobileRecordRow label="Plano" value={student.plan} />
                    <MobileRecordRow label="Mensalidade" value={formatMoney(student.monthly_fee)} />
                    <MobileRecordRow label="Vencimento" value={<span className={dueToneClass(due.tone)}>{due.label}</span>} />
                  </MobileRecord>
                );
              })}
            </div>

            <div className="desktop-table-wrap">
              <table className="table-base min-w-[880px]">
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Telefone</th>
                    <th>Plano</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th className="text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStudents.map((student) => {
                    const due = dueInfo(student);
                    return (
                      <tr key={student.id}>
                        <td>
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                              {initials(student.name)}
                            </div>
                            <div className="min-w-0">
                              <Link className="font-semibold text-ink hover:text-brand" href={`/app/alunos/${student.id}`}>
                                {student.name}
                              </Link>
                              {student.cpf ? <p className="mt-0.5 text-xs text-ink/50">{formatCpf(student.cpf)}</p> : null}
                            </div>
                          </div>
                        </td>
                        <td>{formatPhone(student.phone)}</td>
                        <td>{student.plan}</td>
                        <td>
                          <p className={`font-semibold ${dueToneClass(due.tone)}`}>{due.label}</p>
                          <p className="mt-0.5 text-xs text-ink/45">{due.caption}</p>
                        </td>
                        <td><StudentStatusBadge value={student.status} /></td>
                        <td>
                          <div className="flex justify-end gap-1.5">
                            <Link
                              className="btn-ghost h-9 w-9 p-0"
                              href={`/app/alunos/${student.id}`}
                              aria-label={`Visualizar aluno ${student.name}`}
                              title="Visualizar"
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                            </Link>
                            {role === "ADMIN" ? (
                              <Link
                                className="btn-ghost h-9 w-9 p-0"
                                href={`/app/alunos/${student.id}`}
                                aria-label={`Editar aluno ${student.name}`}
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" aria-hidden />
                              </Link>
                            ) : null}
                            {role === "ADMIN" ? (
                              <button
                                className="btn-ghost h-9 w-9 p-0 text-danger hover:text-danger"
                                type="button"
                                aria-label={`Excluir aluno ${student.name}`}
                                title="Excluir"
                                onClick={() => handleDelete(student)}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PaginationFooter
              currentPage={safePage}
              end={pageEndIndex}
              pages={paginationPages}
              setCurrentPage={setCurrentPage}
              start={pageStartIndex + 1}
              total={filteredStudents.length}
              totalPages={totalPages}
            />
          </>
        )}
      </section>

      {studentModalOpen ? (
        <ModalShell title="Novo aluno" maxWidth="max-w-4xl" onClose={() => closeStudentModal()} footer={
          <>
            <button className="btn-secondary" type="button" onClick={() => closeStudentModal()} disabled={submitting}>
              Cancelar
            </button>
            <button className="btn-primary" type="submit" form="student-create-form" disabled={submitting}>
              <Plus className="h-4 w-4" aria-hidden />
              {submitting ? "Salvando..." : "Salvar aluno"}
            </button>
          </>
        }>
          <form id="student-create-form" onSubmit={handleCreate} className="space-y-5">
            <section>
              <h2 className="text-sm font-bold text-ink">Dados pessoais</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="label" htmlFor="student-name">Nome completo</label>
                  <input
                    id="student-name"
                    className="field h-11"
                    placeholder="Digite o nome"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="student-phone">Telefone</label>
                  <input
                    id="student-phone"
                    className="field h-11"
                    inputMode="tel"
                    placeholder="(13) 99999-9999"
                    value={formatPhone(form.phone)}
                    onChange={(event) => setForm({ ...form, phone: onlyDigits(event.target.value).slice(0, 11) })}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="student-cpf">CPF</label>
                  <input
                    id="student-cpf"
                    className="field h-11"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={formatCpf(form.cpf)}
                    onChange={(event) => setForm({ ...form, cpf: onlyDigits(event.target.value).slice(0, 11) })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="student-email">E-mail</label>
                  <input
                    id="student-email"
                    className="field h-11"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="student-birth">Data de nascimento</label>
                  <input
                    id="student-birth"
                    className="field h-11"
                    type="date"
                    value={form.birth_date}
                    onChange={(event) => setForm({ ...form, birth_date: event.target.value })}
                  />
                </div>
              </div>
            </section>

            <section className="border-t border-line pt-5">
              <h2 className="text-sm font-bold text-ink">Plano e cobranca</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor="student-plan">Plano</label>
                  <input
                    id="student-plan"
                    className="field h-11"
                    list="student-plan-options"
                    value={form.plan}
                    onChange={(event) => setForm({ ...form, plan: event.target.value })}
                    required
                  />
                  <datalist id="student-plan-options">
                    {planOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="label" htmlFor="student-status">Status</label>
                  <select
                    id="student-status"
                    className="field h-11"
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value as StudentStatus })}
                  >
                    {studentStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="student-fee">Mensalidade (R$)</label>
                  <input
                    id="student-fee"
                    className="field h-11"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monthly_fee}
                    onChange={(event) => setForm({ ...form, monthly_fee: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="student-due-day">Dia de vencimento</label>
                  <input
                    id="student-due-day"
                    className="field h-11"
                    type="number"
                    min="1"
                    max="31"
                    value={form.due_day}
                    onChange={(event) => setForm({ ...form, due_day: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="student-start-date">Data de inicio</label>
                  <input id="student-start-date" className="field h-11" type="date" value={dateToInputValue(todayStart())} readOnly disabled />
                </div>
                <div>
                  <label className="label" htmlFor="student-plan-end">Data fim do plano</label>
                  <input
                    id="student-plan-end"
                    className="field h-11"
                    type="date"
                    value={form.plan_end_date}
                    onChange={(event) => setForm({ ...form, plan_end_date: event.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label" htmlFor="student-notes">Observacoes</label>
                  <textarea
                    id="student-notes"
                    className="field min-h-24"
                    placeholder="Adicione observacoes (opcional)"
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  />
                </div>
              </div>
            </section>
          </form>
        </ModalShell>
      ) : null}

      {importModalOpen ? (
        <ModalShell title="Importar planilha" maxWidth="max-w-2xl" onClose={closeImportModal} footer={
          <>
            <button className="btn-secondary" type="button" onClick={closeImportModal} disabled={importing}>
              Cancelar
            </button>
            <button className="btn-primary" type="submit" form="students-import-form" disabled={!importFile || importing}>
              <Upload className="h-4 w-4" aria-hidden />
              {importing ? "Importando..." : "Importar"}
            </button>
          </>
        }>
          <form id="students-import-form" onSubmit={handleImport} className="space-y-4">
            <div>
              <label className="label" htmlFor="import-file">Arquivo CSV ou XLSX</label>
              <input
                id="import-file"
                ref={importInputRef}
                className="field"
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              />
              {importFile ? <p className="mt-2 text-sm font-semibold text-ink/70">{importFile.name}</p> : null}
            </div>
            <div className="rounded-lg border border-line bg-paper/70 p-3 text-sm leading-6 text-ink/65">
              Colunas aceitas: nome, telefone, email, cpf, data_nascimento, plano, mensalidade, vencimento, status e observacoes.
            </div>
            {importResult ? (
              <div className="rounded-lg border border-success/20 bg-success-soft p-3 text-sm text-success-dark">
                <p className="font-semibold">
                  {importResult.imported} importados, {importResult.skipped} ignorados.
                </p>
                {importResult.errors.length ? (
                  <div className="mt-2 space-y-1 text-warning">
                    {importResult.errors.slice(0, 5).map((error) => (
                      <p key={`${error.row}-${error.message}`}>Linha {error.row}: {error.message}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </form>
        </ModalShell>
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone,
  label,
  value
}: {
  icon: typeof Users;
  tone: "blue" | "green" | "yellow" | "red";
  label: string;
  value: number;
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-success-soft text-success-dark",
    yellow: "bg-warning-soft text-warning",
    red: "bg-danger-soft text-danger"
  }[tone];

  return (
    <article className="panel flex items-center gap-4 p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-7 text-ink">{value}</p>
        <p className="mt-1 text-xs font-medium text-ink/55">{label}</p>
      </div>
    </article>
  );
}

function StudentStatusBadge({ value }: { value: StudentStatus }) {
  const meta = {
    ATIVO: { label: "Ativo", className: "border-success/25 bg-success-soft text-success-dark" },
    INATIVO: { label: "Inativo", className: "border-line bg-paper text-muted" },
    INADIMPLENTE: { label: "Vencido", className: "border-danger/20 bg-danger-soft text-danger" }
  }[value];

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function dueToneClass(tone: "default" | "warning" | "danger"): string {
  if (tone === "danger") return "text-danger";
  if (tone === "warning") return "text-warning";
  return "text-ink/80";
}

function PaginationFooter({
  currentPage,
  end,
  pages,
  setCurrentPage,
  start,
  total,
  totalPages
}: {
  currentPage: number;
  end: number;
  pages: number[];
  setCurrentPage: (page: number) => void;
  start: number;
  total: number;
  totalPages: number;
}) {
  let previousPage = 0;

  return (
    <footer className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm text-ink/60 sm:flex-row sm:items-center sm:justify-between">
      <p>
        {total === 0 ? "Mostrando 0 de 0 alunos" : `Mostrando ${start} a ${end} de ${total} alunos`}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          className="btn-secondary h-9 w-9 p-0"
          type="button"
          aria-label="Pagina anterior"
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        {pages.map((pageNumber) => {
          const showEllipsis = previousPage > 0 && pageNumber - previousPage > 1;
          previousPage = pageNumber;
          return (
            <span key={pageNumber} className="flex items-center gap-1.5">
              {showEllipsis ? <span className="px-1 text-xs text-ink/35">...</span> : null}
              <button
                className={pageNumber === currentPage ? "btn-primary h-9 min-w-9 px-3" : "btn-secondary h-9 min-w-9 px-3"}
                type="button"
                aria-current={pageNumber === currentPage ? "page" : undefined}
                onClick={() => setCurrentPage(pageNumber)}
              >
                {pageNumber}
              </button>
            </span>
          );
        })}
        <button
          className="btn-secondary h-9 w-9 p-0"
          type="button"
          aria-label="Proxima pagina"
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </footer>
  );
}

function ModalShell({
  title,
  maxWidth,
  onClose,
  footer,
  children
}: {
  title: string;
  maxWidth: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 py-3 sm:items-center sm:px-5 sm:py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`flex max-h-[calc(100dvh-1.5rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_70px_rgba(0,0,0,0.28)]`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-modal-title"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h1 id="student-modal-title" className="text-base font-bold text-ink">{title}</h1>
          <button className="btn-ghost h-9 w-9 p-0" type="button" onClick={onClose} aria-label="Fechar modal" title="Fechar">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-4 sm:flex-row sm:justify-end">
          {footer}
        </footer>
      </section>
    </div>
  );
}
