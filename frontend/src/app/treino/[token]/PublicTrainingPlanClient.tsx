"use client";

import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronDown,
  Clock3,
  Dumbbell,
  ExternalLink,
  ImageIcon,
  PlayCircle,
  RotateCcw,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { formatDate } from "@/lib/api";
import type { PublicTrainingPlan, PublicTrainingPlanExercise, PublicTrainingPlanMedia } from "@/lib/types";

interface ExerciseEntry {
  exercise: PublicTrainingPlanExercise;
  number: number;
  key: string;
}

interface MuscleGroupSection {
  group: string;
  entries: ExerciseEntry[];
}

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

function parseFirstNumber(value?: string | null): number | null {
  if (!value) return null;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function estimateDurationMinutes(exercises: PublicTrainingPlanExercise[]): number | null {
  if (exercises.length === 0) return null;
  const totalMinutes = exercises.reduce((minutes, exercise) => {
    const sets = Math.max(parseFirstNumber(exercise.sets) ?? 3, 1);
    const restSeconds = Math.max(parseFirstNumber(exercise.rest) ?? 60, 0);
    const executionWindow = Math.max(sets * 2, 3);
    const restWindow = (Math.max(sets - 1, 1) * restSeconds) / 60;
    return minutes + executionWindow + restWindow;
  }, 6);
  return Math.max(20, Math.round(totalMinutes / 5) * 5);
}

function exerciseMeta(exercise: PublicTrainingPlanExercise): string[] {
  return [
    exercise.sets ? `${exercise.sets}x` : null,
    exercise.repetitions ? `${exercise.repetitions} reps` : null,
    exercise.rest ? `${exercise.rest}` : null,
    exercise.load || null
  ].filter(Boolean) as string[];
}

export function PublicTrainingPlanClient({ plan, token }: { plan: PublicTrainingPlan; token: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      cleanupOldProgress(token);
      const raw = window.localStorage.getItem(progressStorageKey(token));
      if (raw) setDone(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Se o storage falhar, seguimos apenas sem persistencia local.
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
    return [...byGroup.entries()].map(([group, entries]) => ({ group, entries }));
  }, [plan.exercises]);

  const total = plan.exercises.length;
  const doneCount = done.size;
  const allDone = total > 0 && doneCount >= total;
  const estimatedDuration = useMemo(() => estimateDurationMinutes(plan.exercises), [plan.exercises]);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <article className="mx-auto min-h-screen max-w-[720px] bg-white sm:border-x sm:border-line">
        <header className="flex items-center gap-3 border-b border-line px-4 py-4 sm:px-7">
          <img
            src={plan.academy_logo_url || "/logo.png"}
            alt={plan.academy_name}
            className="h-10 w-10 border border-line bg-white object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{plan.academy_name}</p>
            <p className="mt-0.5 text-xs text-muted">Ficha de treino</p>
          </div>
        </header>

        <section className="px-4 py-6 sm:px-7 sm:py-8">
          <p className="text-xs font-semibold text-brand">TREINO ATUAL</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-ink sm:text-[28px]">{plan.plan_name}</h1>
          <div className="mt-3 flex items-center gap-2 text-sm font-medium text-ink/70">
            <UserRound className="h-4 w-4 text-brand" strokeWidth={1.75} aria-hidden />
            <span>{plan.student_name}</span>
          </div>

          {plan.objective ? <p className="mt-5 text-sm leading-6 text-ink/65">{plan.objective}</p> : null}

          <div className="mt-5 grid gap-3 border-y border-line py-4 sm:grid-cols-3">
            {estimatedDuration ? (
              <PreviewStat icon={<Clock3 className="h-4 w-4" strokeWidth={1.75} aria-hidden />} text={`${estimatedDuration} min`} />
            ) : null}
            {plan.start_date ? (
              <PreviewStat
                icon={<CalendarClock className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                text={`Inicio ${formatDate(plan.start_date)}`}
              />
            ) : null}
            {plan.reassessment_date ? (
              <PreviewStat
                icon={<RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                text={`Reavaliacao ${formatDate(plan.reassessment_date)}`}
              />
            ) : null}
          </div>

          {total > 0 ? (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-sm font-semibold ${allDone ? "text-ink" : "text-ink/80"}`}>
                    {allDone ? "Treino concluido. Bom descanso!" : "Progresso de hoje"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{doneCount} de {total} exercicios concluidos</p>
                </div>
                {doneCount > 0 ? (
                  <button
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-muted transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    type="button"
                    onClick={resetProgress}
                    title="Recomecar treino"
                    aria-label="Recomecar treino"
                  >
                    <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                ) : null}
              </div>
              <div
                className="mt-3 h-1.5 w-full overflow-hidden bg-line"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={doneCount}
                aria-label="Progresso do treino de hoje"
              >
                <div
                  className="h-full bg-brand transition-all duration-300"
                  style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="border-t border-line px-4 pb-8 pt-6 sm:px-7">
          <div className="mb-2">
            <h2 className="text-lg font-bold text-ink">Exercicios</h2>
            <p className="mt-1 text-sm text-muted">Marque cada exercicio conforme concluir.</p>
          </div>

          {total === 0 ? (
            <div className="mt-5 border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
              Esta ficha ainda nao tem exercicios cadastrados.
            </div>
          ) : (
            <div>
              {sections.map((section) => {
                const groupDone = section.entries.filter((entry) => done.has(entry.key)).length;
                return (
                  <section key={section.group} className="mt-6 border-t-2 border-brand pt-4">
                    <header className="flex items-center justify-between gap-3 pb-3">
                      <div className="flex items-center gap-2 text-brand">
                        <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        <h2 className="text-sm font-bold text-ink">{section.group}</h2>
                      </div>
                      <span className="text-xs font-medium text-muted">
                        {groupDone}/{section.entries.length}
                      </span>
                    </header>

                    <div className="divide-y divide-line border-y border-line">
                      {section.entries.map((entry) => (
                        <ExerciseCard
                          key={entry.key}
                          entry={entry}
                          isDone={done.has(entry.key)}
                          onToggle={() => toggleDone(entry.key)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {plan.notes ? (
            <div className="mt-7 border-l-4 border-brand bg-brand-soft px-4 py-3 text-sm text-brand-deep">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <div>
                  <p className="font-semibold">Orientacoes gerais</p>
                  <p className="mt-1 leading-6">{plan.notes}</p>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <footer className="border-t border-line px-4 py-5 text-center text-xs text-muted sm:px-7">
          {plan.academy_name}
        </footer>
      </article>
    </main>
  );
}

function PreviewStat({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-ink/65">
      <span className="text-brand">{icon}</span>
      {text}
    </span>
  );
}

function ExerciseCard({
  entry,
  isDone,
  onToggle
}: {
  entry: ExerciseEntry;
  isDone: boolean;
  onToggle: () => void;
}) {
  const { exercise, number } = entry;
  const metrics = exerciseMeta(exercise);

  return (
    <article
      className={`py-4 transition ${isDone ? "bg-brand-soft/50" : "bg-white"}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold text-brand">
          {isDone ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden /> : String(number).padStart(2, "0")}
        </span>

        <div className={`min-w-0 flex-1 ${isDone ? "opacity-60" : ""}`}>
          <h3 className="text-sm font-semibold leading-tight text-ink">{exercise.name}</h3>
          {metrics.length > 0 ? <p className="mt-1.5 text-xs text-muted">{metrics.join(" · ")}</p> : null}

          {exercise.media.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {exercise.media.map((media, mediaIndex) => (
                <MediaChip key={`${media.title || "media"}-${mediaIndex}`} media={media} />
              ))}
            </div>
          ) : null}

          {exercise.notes ? (
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted hover:text-brand">
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" strokeWidth={1.75} aria-hidden />
                Observacao
              </summary>
              <p className="mt-2 border-l-2 border-brand-200 pl-3 text-xs leading-5 text-ink/65">{exercise.notes}</p>
            </details>
          ) : null}
        </div>

        <button
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
            isDone
              ? "border-brand bg-brand text-white"
              : "border-line bg-white text-transparent hover:border-brand hover:text-brand/30"
          }`}
          type="button"
          aria-pressed={isDone}
          aria-label={isDone ? `Desmarcar ${exercise.name}` : `Marcar ${exercise.name} como feito`}
          onClick={onToggle}
        >
          <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </article>
  );
}

function MediaChip({ media }: { media: PublicTrainingPlanMedia }) {
  const source = media.file_url || media.external_url;
  if (!source) return null;
  const isVideo = media.media_type === "VIDEO" || media.media_type === "EXTERNAL_VIDEO";
  const Icon = isVideo ? PlayCircle : ImageIcon;
  return (
    <a
      className="inline-flex items-center gap-1.5 border-b border-brand-200 py-0.5 text-xs font-semibold text-brand transition hover:border-brand"
      href={source}
      target="_blank"
      rel="noreferrer"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      {media.title || (isVideo ? "Video" : "Imagem")}
      <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={1.75} aria-hidden />
    </a>
  );
}
