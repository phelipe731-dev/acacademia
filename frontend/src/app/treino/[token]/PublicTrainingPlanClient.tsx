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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f7f4ed_0%,#f4f1ea_30%,#ece8df_100%)] px-4 py-4 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-3 rounded-2xl border border-line bg-white/80 px-4 py-3 shadow-[0_10px_30px_rgba(16,25,21,0.06)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-ink ring-1 ring-black/5">
              <img
                src={plan.academy_logo_url || "/logo.png"}
                alt={plan.academy_name}
                className="h-full w-full object-cover"
              />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-ink">{plan.academy_name}</p>
              <p className="text-[11px] font-medium text-ink/45">Ficha de treino</p>
            </div>
          </div>
          <div className="rounded-full bg-paper px-3 py-1 text-[11px] font-semibold text-ink/45">
            Link publico
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px),minmax(0,1fr)] xl:gap-5">
          <section className="rounded-[30px] border border-line bg-surface shadow-[0_24px_60px_rgba(16,25,21,0.12)] lg:sticky lg:top-5 lg:self-start">
            <div className="bg-white/70 px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[28px]">{plan.plan_name}</h1>
                  <div className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-sm font-semibold text-ink/70">
                    <UserRound className="h-4 w-4 text-ink/45" aria-hidden />
                    {plan.student_name}
                  </div>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    allDone ? "bg-success-soft text-success-dark" : "bg-brand-soft text-brand-dark"
                  }`}
                >
                  {allDone ? "Treino concluido" : `${doneCount}/${total || 0} feitos`}
                </div>
              </div>

              {plan.objective ? <p className="mt-4 text-sm leading-6 text-ink/65">{plan.objective}</p> : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {estimatedDuration ? (
                  <PreviewStat icon={<Clock3 className="h-3.5 w-3.5" aria-hidden />} text={`${estimatedDuration} min`} />
                ) : null}
                {plan.start_date ? (
                  <PreviewStat
                    icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}
                    text={formatDate(plan.start_date)}
                  />
                ) : null}
                {plan.reassessment_date ? (
                  <PreviewStat
                    icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                    text={`Reavaliacao ${formatDate(plan.reassessment_date)}`}
                  />
                ) : null}
              </div>

              {total > 0 ? (
                <div className="mt-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <p className={`text-sm font-bold ${allDone ? "text-success-dark" : "text-ink/75"}`}>
                      {allDone ? "Treino concluido! Bom descanso." : "Progresso do treino de hoje"}
                    </p>
                    {doneCount > 0 ? (
                      <button
                        className="inline-flex w-fit items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink/50 transition hover:text-ink"
                        type="button"
                        onClick={resetProgress}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Recomecar
                      </button>
                    ) : null}
                  </div>
                  <div
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.07]"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={doneCount}
                    aria-label="Progresso do treino de hoje"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        allDone ? "bg-success" : "bg-brand"
                      }`}
                      style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-[30px] border border-line bg-surface shadow-[0_24px_60px_rgba(16,25,21,0.12)]">
            <div className="border-b border-line bg-white/70 px-5 py-4">
              <h2 className="text-base font-bold tracking-tight text-ink">Exercicios do treino</h2>
              <p className="mt-1 text-sm text-ink/55">Visualizacao otimizada para celular e desktop.</p>
            </div>

            <div className="bg-paper/60 px-4 pb-5 pt-4 sm:px-5">
              {total === 0 ? (
                <section className="rounded-2xl border border-dashed border-line bg-paper px-4 py-10 text-center text-sm text-ink/60">
                  Esta ficha ainda nao tem exercicios cadastrados.
                </section>
              ) : (
                <div className="space-y-4 xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0">
                  {sections.map((section) => {
                    const groupDone = section.entries.filter((entry) => done.has(entry.key)).length;
                    return (
                      <section
                        key={section.group}
                        className="rounded-[24px] border border-line bg-white px-3.5 py-3.5 shadow-[0_10px_24px_rgba(16,25,21,0.05)]"
                      >
                        <header className="flex items-center justify-between gap-3 pb-2">
                          <div className="inline-flex items-center gap-2 text-brand-dark">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
                              <Dumbbell className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            <h2 className="text-sm font-bold tracking-tight text-ink">{section.group}</h2>
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              groupDone === section.entries.length ? "text-success-dark" : "text-ink/45"
                            }`}
                          >
                            {groupDone}/{section.entries.length}
                          </span>
                        </header>

                        <div className="space-y-2.5">
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
                <div className="mt-4 rounded-[22px] border border-warning/20 bg-warning-soft px-4 py-3.5 text-sm text-warning">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <div>
                      <p className="font-semibold">Orientacoes gerais</p>
                      <p className="mt-1 leading-6 text-warning/90">{plan.notes}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <p className="mt-4 text-center text-xs font-medium text-ink/40">
          {plan.academy_name} - Foco - Forca - Resultados
        </p>
      </div>
    </main>
  );
}

function PreviewStat({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1.5 text-[11px] font-semibold text-ink/65">
      <span className="text-ink/45">{icon}</span>
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
      className={`rounded-2xl border border-line bg-surface px-3 py-2.5 transition ${
        isDone ? "bg-success-soft/40" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
            isDone ? "bg-success text-white" : "bg-brand-soft text-brand-dark"
          }`}
        >
          {isDone ? <Check className="h-4 w-4" aria-hidden /> : number}
        </span>

        <div className={`min-w-0 flex-1 ${isDone ? "opacity-65" : ""}`}>
          <h3 className="text-sm font-semibold leading-tight text-ink">{exercise.name}</h3>
          {metrics.length > 0 ? <p className="mt-1 text-xs text-ink/60">{metrics.join(" · ")}</p> : null}

          {exercise.media.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {exercise.media.map((media, mediaIndex) => (
                <MediaChip key={`${media.title || "media"}-${mediaIndex}`} media={media} />
              ))}
            </div>
          ) : null}

          {exercise.notes ? (
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-semibold text-ink/55 hover:text-ink">
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden />
                Observacao
              </summary>
              <p className="mt-1.5 rounded-xl bg-paper px-3 py-2 text-xs leading-6 text-ink/75">{exercise.notes}</p>
            </details>
          ) : null}
        </div>

        <button
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
            isDone
              ? "border-success bg-success text-white"
              : "border-line bg-white text-transparent hover:border-success hover:text-success/40"
          }`}
          type="button"
          aria-pressed={isDone}
          aria-label={isDone ? `Desmarcar ${exercise.name}` : `Marcar ${exercise.name} como feito`}
          onClick={onToggle}
        >
          <Check className="h-5 w-5" aria-hidden />
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
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-1 text-[11px] font-bold text-brand-dark transition hover:bg-brand hover:text-white"
      href={source}
      target="_blank"
      rel="noreferrer"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {media.title || (isVideo ? "Video" : "Imagem")}
      <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
    </a>
  );
}
