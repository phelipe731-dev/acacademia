"use client";

import { AlertCircle, Check, ChevronDown, ExternalLink, ImageIcon, PlayCircle, RotateCcw } from "lucide-react";
import Image from "next/image";
import { use, useEffect, useMemo, useState } from "react";

import { apiFetch, formatDate } from "@/lib/api";
import type { PublicTrainingPlan, PublicTrainingPlanExercise, PublicTrainingPlanMedia } from "@/lib/types";

interface ExerciseEntry {
  exercise: PublicTrainingPlanExercise;
  /** Posicao global (1-based) na ficha, estavel para numeracao e progresso. */
  number: number;
  /** Chave estavel para o progresso salvo no navegador. */
  key: string;
}

interface MuscleGroupSection {
  group: string;
  entries: ExerciseEntry[];
}

/** Progresso e por dia: amanha o treino recomeca zerado. */
function progressStorageKey(token: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `ac-treino-progress:${token}:${today}`;
}

function cleanupOldProgress(token: string): void {
  const current = progressStorageKey(token);
  const prefix = `ac-treino-progress:${token}:`;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(prefix) && key !== current) {
      window.localStorage.removeItem(key);
    }
  }
}

export default function PublicTrainingPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [plan, setPlan] = useState<PublicTrainingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch<PublicTrainingPlan>(`/public/training-plans/${token}`)
      .then(setPlan)
      .catch(() => setError("Este link de treino esta invalido, expirado ou foi revogado."))
      .finally(() => setLoading(false));
  }, [token]);

  // Carrega o progresso do dia (client-only, apos montar — evita mismatch de hidratacao).
  useEffect(() => {
    try {
      cleanupOldProgress(token);
      const raw = window.localStorage.getItem(progressStorageKey(token));
      if (raw) setDone(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Progresso e conveniencia; se o storage falhar, segue sem ele.
    }
  }, [token]);

  function persistDone(next: Set<string>): void {
    setDone(next);
    try {
      window.localStorage.setItem(progressStorageKey(token), JSON.stringify([...next]));
    } catch {
      // storage cheio/indisponivel: mantem apenas em memoria.
    }
  }

  function toggleDone(key: string): void {
    const next = new Set(done);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    persistDone(next);
  }

  function resetProgress(): void {
    persistDone(new Set());
  }

  const sections = useMemo<MuscleGroupSection[]>(() => {
    if (!plan) return [];
    const byGroup = new Map<string, ExerciseEntry[]>();
    plan.exercises.forEach((exercise, index) => {
      const group = exercise.muscle_group?.trim() || "Outros";
      const entry: ExerciseEntry = {
        exercise,
        number: index + 1,
        key: `${index}:${exercise.name}`
      };
      const bucket = byGroup.get(group);
      if (bucket) {
        bucket.push(entry);
      } else {
        byGroup.set(group, [entry]);
      }
    });
    // Ordem dos grupos = ordem de aparicao na ficha (respeita o sort_order do professor).
    return [...byGroup.entries()].map(([group, entries]) => ({ group, entries }));
  }, [plan]);

  const total = plan?.exercises.length ?? 0;
  const doneCount = done.size;
  const allDone = total > 0 && doneCount >= total;

  if (loading) {
    return (
      <main className="min-h-screen bg-paper">
        <TopBar />
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-5">
          <div className="skeleton h-24" />
          <div className="skeleton h-72" />
        </div>
      </main>
    );
  }

  if (error || !plan) {
    return (
      <main className="min-h-screen bg-paper">
        <TopBar />
        <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertCircle className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-bold text-ink">Ficha indisponivel</h1>
          <p className="mt-2 text-sm leading-6 text-ink/60">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper pb-10">
      <TopBar />

      <div className="mx-auto max-w-2xl px-4 py-5">
        {/* Resumo compacto da ficha */}
        <section className="rounded-xl border border-line bg-surface p-4 shadow-soft">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h1 className="text-xl font-bold tracking-tight text-ink">{plan.plan_name}</h1>
            <p className="text-sm font-semibold text-brand">{plan.student_name}</p>
          </div>
          {plan.objective ? <p className="mt-1 text-sm text-ink/60">{plan.objective}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            {plan.start_date ? (
              <span className="rounded-full bg-paper px-2.5 py-1 text-ink/70">Inicio: {formatDate(plan.start_date)}</span>
            ) : null}
            {plan.reassessment_date ? (
              <span className="rounded-full bg-paper px-2.5 py-1 text-ink/70">
                Reavaliacao: {formatDate(plan.reassessment_date)}
              </span>
            ) : null}
          </div>

          {/* Progresso do treino de hoje */}
          {total > 0 ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <p className={`text-sm font-bold ${allDone ? "text-success-dark" : "text-ink/75"}`}>
                  {allDone ? "Treino concluido! Bom descanso." : `${doneCount}/${total} exercicios feitos hoje`}
                </p>
                {doneCount > 0 ? (
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink/50 transition hover:text-ink"
                    type="button"
                    onClick={resetProgress}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Recomecar
                  </button>
                ) : null}
              </div>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/[0.07]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={doneCount}
                aria-label="Progresso do treino de hoje"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${allDone ? "bg-success" : "bg-brand"}`}
                  style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : null}

          {plan.notes ? (
            <details className="group mt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-ink/60 hover:text-ink">
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden />
                Orientacoes gerais
              </summary>
              <p className="mt-2 rounded-lg bg-paper p-3 text-sm leading-6 text-ink/75">{plan.notes}</p>
            </details>
          ) : null}
        </section>

        {/* Exercicios agrupados por grupo muscular */}
        {total === 0 ? (
          <section className="mt-4 rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink/60 shadow-soft">
            Esta ficha ainda nao tem exercicios cadastrados.
          </section>
        ) : (
          sections.map((section) => {
            const groupDone = section.entries.filter((entry) => done.has(entry.key)).length;
            return (
              <section key={section.group} className="mt-4 overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
                <header className="flex items-center justify-between border-b border-line bg-paper/70 px-4 py-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-ink/70">{section.group}</h2>
                  <span
                    className={`text-xs font-bold ${
                      groupDone === section.entries.length ? "text-success-dark" : "text-ink/45"
                    }`}
                  >
                    {groupDone}/{section.entries.length}
                  </span>
                </header>
                <ol className="divide-y divide-line/70">
                  {section.entries.map((entry) => (
                    <ExerciseRow
                      key={entry.key}
                      entry={entry}
                      isDone={done.has(entry.key)}
                      onToggle={() => toggleDone(entry.key)}
                    />
                  ))}
                </ol>
              </section>
            );
          })
        )}

        <p className="mt-5 text-center text-xs text-ink/45">
          {plan.academy_name} - Foco - Forca - Resultados
        </p>
      </div>
    </main>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-10 border-b border-sidebar-line bg-sidebar">
      <div className="mx-auto flex h-12 max-w-2xl items-center gap-2.5 px-4">
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-ink ring-1 ring-white/10">
          <Image src="/logo.png" alt="AC Suplementos" width={32} height={32} className="h-full w-full object-cover" priority />
        </span>
        <span className="text-sm font-bold tracking-tight text-white">AC Suplementos</span>
        <span className="ml-auto text-[11px] font-medium text-white/40">Ficha de treino</span>
      </div>
    </header>
  );
}

function ExerciseRow({
  entry,
  isDone,
  onToggle
}: {
  entry: ExerciseEntry;
  isDone: boolean;
  onToggle: () => void;
}) {
  const { exercise, number } = entry;
  const metrics = [
    exercise.sets ? `${exercise.sets} series` : null,
    exercise.repetitions ? `${exercise.repetitions} reps` : null,
    exercise.load || null,
    exercise.rest ? `${exercise.rest} descanso` : null
  ].filter(Boolean) as string[];

  return (
    <li className={`px-4 py-3 transition-colors ${isDone ? "bg-success-soft/50" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white ${
            isDone ? "bg-success" : "bg-brand"
          }`}
        >
          {isDone ? <Check className="h-3.5 w-3.5" aria-hidden /> : number}
        </span>

        <div className={`min-w-0 flex-1 ${isDone ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-[15px] font-bold leading-tight text-ink">{exercise.name}</h3>
          </div>

          {metrics.length > 0 ? (
            <p className="mt-1 text-sm font-semibold text-ink/80">{metrics.join(" · ")}</p>
          ) : null}

          {(exercise.media.length > 0 || exercise.notes) ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {exercise.media.map((media, mediaIndex) => (
                <MediaChip key={`${media.title || "media"}-${mediaIndex}`} media={media} />
              ))}
              {exercise.notes ? (
                <details className="group w-full">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-ink/55 hover:text-ink">
                    <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden />
                    Observacao
                  </summary>
                  <p className="mt-1.5 rounded-lg bg-paper p-2.5 text-sm leading-6 text-ink/75">{exercise.notes}</p>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
            isDone
              ? "border-success bg-success text-white"
              : "border-line bg-surface text-transparent hover:border-success hover:text-success/40"
          }`}
          type="button"
          aria-pressed={isDone}
          aria-label={isDone ? `Desmarcar ${exercise.name}` : `Marcar ${exercise.name} como feito`}
          onClick={onToggle}
        >
          <Check className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </li>
  );
}

function MediaChip({ media }: { media: PublicTrainingPlanMedia }) {
  const source = media.file_url || media.external_url;
  if (!source) return null;
  const isVideo = media.media_type === "VIDEO" || media.media_type === "EXTERNAL_VIDEO";
  const Icon = isVideo ? PlayCircle : ImageIcon;
  return (
    <a
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-dark transition hover:bg-brand hover:text-white"
      href={source}
      target="_blank"
      rel="noreferrer"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {media.title || (isVideo ? "Ver video" : "Ver imagem")}
      <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
    </a>
  );
}
