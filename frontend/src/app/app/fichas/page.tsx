"use client";

import { Dumbbell, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Message } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import type { Student } from "@/lib/types";

export default function TrainingPlansIndexPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Student[]>("/students")
      .then(setStudents)
      .catch((error) => setMessage(getErrorMessage(error, "Erro ao carregar alunos.")))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter(
      (student) => student.name.toLowerCase().includes(term) || student.phone.includes(term)
    );
  }, [students, search]);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Fichas de treino" subtitle="Escolha um aluno para criar ou editar fichas digitais." />

      {message ? <Message message={message} type="error" /> : null}

      <section className="panel p-5">
        <label className="label" htmlFor="training-student-search">Buscar aluno</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink/55" aria-hidden />
          <input
            id="training-student-search"
            className="field pl-9"
            placeholder="Nome ou telefone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="panel-title">Alunos</h2>
        <div className="mt-4">
          {loading ? (
            <SkeletonRows rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum aluno encontrado" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((student) => (
                <article key={student.id} className="rounded-lg border border-line bg-surface p-3.5 transition hover:bg-paper/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{student.name}</p>
                      <p className="mt-1 text-xs text-ink/55">{student.phone} · {student.plan}</p>
                    </div>
                    <StatusBadge value={student.status} />
                  </div>
                  <Link className="btn-primary mt-3 w-full" href={`/app/alunos/${student.id}`}>
                    <Dumbbell className="h-4 w-4" aria-hidden />
                    Abrir fichas
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
