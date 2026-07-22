"use client";

import {
  AlertCircle,
  CalendarClock,
  ChevronDown,
  Clock3,
  Copy,
  Dumbbell,
  ExternalLink,
  ImageIcon,
  ImagePlus,
  Link2,
  PlayCircle,
  Plus,
  Save,
  Share2,
  Trash2,
  Video
} from "lucide-react";
import Link from "next/link";
import { FormEvent, use, useEffect, useMemo, useState } from "react";

import { Message } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatDate, getSession } from "@/lib/api";
import type {
  TrainingMediaType,
  TrainingPlan,
  TrainingPlanExercise,
  TrainingPlanExerciseMedia,
  TrainingPlanShareLink,
  UserRole
} from "@/lib/types";

const mediaLabels: Record<TrainingMediaType, string> = {
  IMAGE: "Imagem",
  VIDEO: "Video",
  EXTERNAL_IMAGE: "Imagem externa",
  EXTERNAL_VIDEO: "Video externo"
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const planFormId = "training-plan-form";

function mediaUrl(url?: string | null) {
  if (!url) return "#";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_URL}${url}`;
}

interface MediaDraft {
  media_type: TrainingMediaType;
  external_url: string;
  title: string;
  description: string;
  sort_order: string;
  file: File | null;
}

interface ExerciseGroupSection {
  group: string;
  entries: TrainingPlanExercise[];
}

const emptyExercise = {
  name: "",
  muscle_group: "",
  sets: "",
  repetitions: "",
  load: "",
  rest: "",
  notes: "",
  sort_order: "1"
};

function emptyMedia(): MediaDraft {
  return {
    media_type: "EXTERNAL_VIDEO",
    external_url: "",
    title: "",
    description: "",
    sort_order: "0",
    file: null
  };
}

function groupExercises(exercises: TrainingPlanExercise[]): ExerciseGroupSection[] {
  const byGroup = new Map<string, TrainingPlanExercise[]>();
  exercises.forEach((exercise) => {
    const group = exercise.muscle_group?.trim() || "Outros";
    const bucket = byGroup.get(group);
    if (bucket) {
      bucket.push(exercise);
    } else {
      byGroup.set(group, [exercise]);
    }
  });
  return [...byGroup.entries()].map(([group, entries]) => ({ group, entries }));
}

function parseFirstNumber(value?: string | number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return null;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function estimateDurationMinutes(exercises: TrainingPlanExercise[]): number | null {
  if (exercises.length === 0) return null;
  const totalMinutes = exercises.reduce((minutes, exercise) => {
    const sets = Math.max(parseFirstNumber(exercise.sets) ?? 3, 1);
    const restSeconds = Math.max(parseFirstNumber(exercise.rest) ?? 60, 0);
    const executionWindow = Math.max(sets * 2.2, 3);
    const restWindow = (Math.max(sets - 1, 1) * restSeconds) / 60;
    return minutes + executionWindow + restWindow;
  }, 6);
  return Math.max(20, Math.round(totalMinutes / 5) * 5);
}

function exerciseMeta(exercise: TrainingPlanExercise): string[] {
  return [
    exercise.sets ? `${exercise.sets} series` : null,
    exercise.repetitions ? `${exercise.repetitions} reps` : null,
    exercise.rest ? `${exercise.rest} descanso` : null,
    exercise.load || null
  ].filter(Boolean) as string[];
}

export default function TrainingPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [role, setRole] = useState<UserRole>("RECEPCAO");
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [shareLink, setShareLink] = useState<TrainingPlanShareLink | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [creatingExercise, setCreatingExercise] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [exerciseForm, setExerciseForm] = useState(emptyExercise);
  const [mediaForms, setMediaForms] = useState<Record<number, MediaDraft>>({});
  const [addingMediaId, setAddingMediaId] = useState<number | null>(null);

  const canEdit = role === "ADMIN" || role === "PROFESSOR";

  async function load() {
    const [planData, linkData] = await Promise.all([
      apiFetch<TrainingPlan>(`/training-plans/${id}`),
      apiFetch<TrainingPlanShareLink | null>(`/training-plans/${id}/share-link`)
    ]);
    setPlan(planData);
    setShareLink(linkData);
  }

  useEffect(() => {
    setRole(getSession()?.user.role ?? "RECEPCAO");
    load()
      .catch((error) => setMessage({ text: getErrorMessage(error, "Erro ao carregar ficha de treino."), type: "error" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!plan) return;
    setExerciseForm((current) => {
      const untouched =
        !current.name &&
        !current.muscle_group &&
        !current.sets &&
        !current.repetitions &&
        !current.load &&
        !current.rest &&
        !current.notes;
      if (!untouched) return current;
      return { ...current, sort_order: String(plan.exercises.length + 1) };
    });
  }, [plan]);

  const activeExercises = useMemo(
    () => plan?.exercises.filter((exercise) => exercise.is_active) ?? [],
    [plan?.exercises]
  );
  const groupedExercises = useMemo(() => groupExercises(plan?.exercises ?? []), [plan?.exercises]);
  const publicPreviewGroups = useMemo(() => groupExercises(activeExercises), [activeExercises]);
  const exerciseNumberById = useMemo(
    () =>
      new Map(
        (plan?.exercises ?? []).map((exercise, index) => [exercise.id, index + 1] as const)
      ),
    [plan?.exercises]
  );
  const activeMediaCount = useMemo(
    () =>
      activeExercises.reduce(
        (count, exercise) => count + exercise.media.filter((media) => media.is_active).length,
        0
      ),
    [activeExercises]
  );
  const estimatedDuration = useMemo(() => estimateDurationMinutes(activeExercises), [activeExercises]);

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || savingPlan || !canEdit) return;
    setSavingPlan(true);
    setMessage(null);
    try {
      const updated = await apiFetch<TrainingPlan>(`/training-plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: plan.name,
          objective: plan.objective || null,
          start_date: plan.start_date || null,
          reassessment_date: plan.reassessment_date || null,
          notes: plan.notes || null,
          is_active: plan.is_active
        })
      });
      setPlan(updated);
      setMessage({ text: "Ficha salva.", type: "success" });
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao salvar ficha."), type: "error" });
    } finally {
      setSavingPlan(false);
    }
  }

  async function createExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || creatingExercise || !canEdit) return;
    setCreatingExercise(true);
    setMessage(null);
    try {
      await apiFetch<TrainingPlanExercise>(`/training-plans/${plan.id}/exercises`, {
        method: "POST",
        body: JSON.stringify({
          name: exerciseForm.name,
          muscle_group: exerciseForm.muscle_group || null,
          sets: exerciseForm.sets || null,
          repetitions: exerciseForm.repetitions || null,
          load: exerciseForm.load || null,
          rest: exerciseForm.rest || null,
          notes: exerciseForm.notes || null,
          sort_order: Number(exerciseForm.sort_order || 0),
          is_active: true
        })
      });
      setExerciseForm({
        ...emptyExercise,
        muscle_group: exerciseForm.muscle_group,
        sort_order: String(plan.exercises.length + 1)
      });
      setMessage({ text: "Exercicio adicionado.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao adicionar exercicio."), type: "error" });
    } finally {
      setCreatingExercise(false);
    }
  }

  async function deactivateExercise(exercise: TrainingPlanExercise) {
    if (!window.confirm(`Inativar exercicio ${exercise.name}?`)) return;
    try {
      await apiFetch(`/training-plan-exercises/${exercise.id}/deactivate`, { method: "POST" });
      setMessage({ text: "Exercicio inativado.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao inativar exercicio."), type: "error" });
    }
  }

  async function addMedia(event: FormEvent<HTMLFormElement>, exercise: TrainingPlanExercise) {
    event.preventDefault();
    if (!canEdit || addingMediaId !== null) return;
    const draft = mediaForms[exercise.id] ?? emptyMedia();
    setAddingMediaId(exercise.id);
    setMessage(null);
    const form = new FormData();
    form.append("media_type", draft.file ? "IMAGE" : draft.media_type);
    form.append("title", draft.title);
    form.append("description", draft.description);
    form.append("sort_order", draft.sort_order || "0");
    if (draft.file) {
      form.append("file", draft.file);
    } else {
      form.append("external_url", draft.external_url);
    }
    try {
      await apiFetch<TrainingPlanExerciseMedia>(`/training-plan-exercises/${exercise.id}/media`, {
        method: "POST",
        body: form
      });
      setMediaForms((current) => ({ ...current, [exercise.id]: emptyMedia() }));
      setMessage({ text: "Midia adicionada.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao adicionar midia."), type: "error" });
    } finally {
      setAddingMediaId(null);
    }
  }

  async function deactivateMedia(media: TrainingPlanExerciseMedia) {
    if (!window.confirm("Inativar esta midia?")) return;
    try {
      await apiFetch(`/training-plan-exercise-media/${media.id}/deactivate`, { method: "POST" });
      setMessage({ text: "Midia inativada.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao inativar midia."), type: "error" });
    }
  }

  async function generateLink() {
    if (!plan || sharing || !canEdit) return;
    setSharing(true);
    setMessage(null);
    try {
      const link = await apiFetch<TrainingPlanShareLink>(`/training-plans/${plan.id}/share-link`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setShareLink(link);
      setMessage({ text: "Link publico pronto.", type: "success" });
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao gerar link."), type: "error" });
    } finally {
      setSharing(false);
    }
  }

  async function revokeLink() {
    if (!plan || !shareLink || !canEdit) return;
    if (!window.confirm("Revogar o link publico desta ficha?")) return;
    try {
      await apiFetch(`/training-plans/${plan.id}/share-link/revoke`, { method: "POST" });
      setShareLink(null);
      setMessage({ text: "Link revogado.", type: "success" });
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao revogar link."), type: "error" });
    }
  }

  async function copyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink.public_url);
      setMessage({ text: "Link copiado.", type: "success" });
    } catch {
      setMessage({ text: "Nao foi possivel copiar o link. Copie manualmente.", type: "error" });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ficha de treino" subtitle="Carregando ficha..." />
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <div className="panel p-5"><SkeletonRows rows={6} /></div>
          <div className="panel p-5"><SkeletonRows rows={7} height="h-20" /></div>
          <div className="panel p-5 xl:col-span-2 2xl:col-span-1"><SkeletonRows rows={4} height="h-24" /></div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return <Message message={message?.text || "Ficha de treino nao encontrada."} type="error" />;
  }

  const whatsappMessage = `Ola, ${plan.student?.name || "aluno"}! Segue sua ficha de treino digital:\n${shareLink?.public_url || ""}\n\nQualquer duvida, fale com a equipe da academia.`;

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={plan.name}
        subtitle={plan.student ? `Ficha de ${plan.student.name}` : "Ficha de treino"}
      >
        <Link className="btn-secondary w-full sm:w-auto" href={`/app/alunos/${plan.student_id}`}>
          Voltar ao aluno
        </Link>
        {canEdit ? (
          shareLink ? (
            <button className="btn-secondary w-full sm:w-auto" type="button" onClick={copyLink}>
              <Copy className="h-4 w-4" aria-hidden />
              Copiar link
            </button>
          ) : (
            <button className="btn-secondary w-full sm:w-auto" type="button" onClick={generateLink} disabled={sharing}>
              <Link2 className="h-4 w-4" aria-hidden />
              {sharing ? "Gerando..." : "Gerar link"}
            </button>
          )
        ) : null}
        {canEdit ? (
          <button className="btn-primary w-full sm:w-auto" type="submit" form={planFormId} disabled={savingPlan}>
            <Save className="h-4 w-4" aria-hidden />
            {savingPlan ? "Salvando..." : "Salvar ficha"}
          </button>
        ) : null}
      </PageHeader>

      {message ? <Message message={message.text} type={message.type} /> : null}

      <section className="grid gap-4 lg:hidden">
        <div className="panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Resumo rapido</p>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-ink">{plan.student?.name || "Aluno"}</h2>
              <p className="mt-1 text-sm text-ink/55">{plan.objective || "Ficha pronta para ajuste e acompanhamento."}</p>
            </div>
            <StatusBadge value={plan.is_active ? "ATIVO" : "INATIVO"} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard
              icon={<Dumbbell className="h-4 w-4" aria-hidden />}
              label="Exercicios"
              value={String(activeExercises.length)}
            />
            <MetricCard
              icon={<Clock3 className="h-4 w-4" aria-hidden />}
              label="Duracao"
              value={estimatedDuration ? `${estimatedDuration} min` : "-"}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <a className="btn-secondary w-full px-3" href="#link-aluno">
            Link
          </a>
          <a className="btn-secondary w-full px-3" href="#dados-ficha">
            Dados
          </a>
          <a className="btn-secondary w-full px-3" href="#exercicios-ficha">
            Exercicios
          </a>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)] 2xl:grid-cols-[320px,minmax(0,1fr),340px]">
        <aside className="order-2 space-y-5 xl:order-1">
          <form id={planFormId} onSubmit={savePlan} className="panel p-5" aria-label="Dados da ficha" >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div id="dados-ficha" className="sr-only" aria-hidden />
                <h2 className="panel-title">Dados da ficha</h2>
                <p className="mt-1 text-sm text-ink/55">
                  Ajuste objetivo, datas e orientacoes principais do treino.
                </p>
              </div>
              <StatusBadge value={plan.is_active ? "ATIVO" : "INATIVO"} />
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="plan-name">Nome da ficha</label>
                <input
                  id="plan-name"
                  className="field"
                  disabled={!canEdit}
                  value={plan.name}
                  onChange={(event) => setPlan({ ...plan, name: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="plan-student">Aluno</label>
                <input
                  id="plan-student"
                  className="field"
                  disabled
                  value={plan.student?.name || `Aluno #${plan.student_id}`}
                />
              </div>
              <div>
                <label className="label" htmlFor="plan-objective">Objetivo</label>
                <input
                  id="plan-objective"
                  className="field"
                  disabled={!canEdit}
                  value={plan.objective || ""}
                  onChange={(event) => setPlan({ ...plan, objective: event.target.value })}
                  placeholder="Hipertrofia, condicionamento, retorno..."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <label className="label" htmlFor="plan-start">Inicio</label>
                  <input
                    id="plan-start"
                    className="field"
                    disabled={!canEdit}
                    type="date"
                    value={plan.start_date || ""}
                    onChange={(event) => setPlan({ ...plan, start_date: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="plan-review">Reavaliacao</label>
                  <input
                    id="plan-review"
                    className="field"
                    disabled={!canEdit}
                    type="date"
                    value={plan.reassessment_date || ""}
                    onChange={(event) => setPlan({ ...plan, reassessment_date: event.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="plan-status">Status</label>
                <select
                  id="plan-status"
                  className="field"
                  disabled={!canEdit}
                  value={plan.is_active ? "ATIVO" : "INATIVO"}
                  onChange={(event) => setPlan({ ...plan, is_active: event.target.value === "ATIVO" })}
                >
                  <option value="ATIVO">Ativa</option>
                  <option value="INATIVO">Inativa</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="plan-notes">Observacoes gerais</label>
                <textarea
                  id="plan-notes"
                  className="field min-h-[110px]"
                  disabled={!canEdit}
                  rows={4}
                  value={plan.notes || ""}
                  onChange={(event) => setPlan({ ...plan, notes: event.target.value })}
                  placeholder="Orientacoes para execucao, progressao, postura e cuidados."
                />
              </div>
            </div>
          </form>

          <section className="panel p-5">
            <h2 className="panel-title">Resumo da ficha</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-1 2xl:grid-cols-2">
              <MetricCard
                icon={<Dumbbell className="h-4 w-4" aria-hidden />}
                label="Exercicios ativos"
                value={String(activeExercises.length)}
              />
              <MetricCard
                icon={<Clock3 className="h-4 w-4" aria-hidden />}
                label="Duracao estimada"
                value={estimatedDuration ? `${estimatedDuration} min` : "-"}
              />
              <MetricCard
                icon={<CalendarClock className="h-4 w-4" aria-hidden />}
                label="Grupos na ficha"
                value={String(publicPreviewGroups.length)}
              />
              <MetricCard
                icon={<ImagePlus className="h-4 w-4" aria-hidden />}
                label="Midias ativas"
                value={String(activeMediaCount)}
              />
            </div>
            <div className="mt-4 rounded-xl border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning">
              <p className="font-semibold">Atenção</p>
              <p className="mt-1 text-warning/90">
                Alteracoes salvas aqui refletem no link do aluno assim que o preview for atualizado.
              </p>
            </div>
          </section>
        </aside>

        <div className="order-3 space-y-5 xl:order-2">
          {canEdit ? (
            <section id="exercicios-ficha" className="panel p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="panel-title">Adicionar exercicio</h2>
                  <p className="mt-1 text-sm text-ink/55">
                    Monte a ficha por blocos. O grupo muscular ajuda a organizar a visualizacao do aluno.
                  </p>
                </div>
                <div className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink/55">
                  Proxima ordem: {exerciseForm.sort_order}
                </div>
              </div>

              <form onSubmit={createExercise} className="mt-5 space-y-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr),minmax(0,0.9fr),110px]">
                  <div>
                    <label className="label" htmlFor="exercise-name">Exercicio</label>
                    <input
                      id="exercise-name"
                      className="field"
                      required
                      value={exerciseForm.name}
                      onChange={(event) => setExerciseForm({ ...exerciseForm, name: event.target.value })}
                      placeholder="Supino reto com barra"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="exercise-group">Grupo muscular</label>
                    <input
                      id="exercise-group"
                      className="field"
                      value={exerciseForm.muscle_group}
                      onChange={(event) => setExerciseForm({ ...exerciseForm, muscle_group: event.target.value })}
                      placeholder="Peito, Costas, Pernas..."
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="exercise-order">Ordem</label>
                    <input
                      id="exercise-order"
                      className="field"
                      type="number"
                      min="0"
                      value={exerciseForm.sort_order}
                      onChange={(event) => setExerciseForm({ ...exerciseForm, sort_order: event.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
                  <div>
                    <label className="label" htmlFor="exercise-sets">Series</label>
                    <input
                      id="exercise-sets"
                      className="field"
                      placeholder="4"
                      value={exerciseForm.sets}
                      onChange={(event) => setExerciseForm({ ...exerciseForm, sets: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="exercise-repetitions">Repeticoes</label>
                    <input
                      id="exercise-repetitions"
                      className="field"
                      placeholder="10 a 12"
                      value={exerciseForm.repetitions}
                      onChange={(event) => setExerciseForm({ ...exerciseForm, repetitions: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="exercise-load">Carga</label>
                    <input
                      id="exercise-load"
                      className="field"
                      placeholder="Moderada"
                      value={exerciseForm.load}
                      onChange={(event) => setExerciseForm({ ...exerciseForm, load: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="exercise-rest">Descanso</label>
                    <input
                      id="exercise-rest"
                      className="field"
                      placeholder="60s"
                      value={exerciseForm.rest}
                      onChange={(event) => setExerciseForm({ ...exerciseForm, rest: event.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="exercise-notes">Observacao curta</label>
                  <input
                    id="exercise-notes"
                    className="field"
                    placeholder="Execucao, postura, amplitude, respiracao..."
                    value={exerciseForm.notes}
                    onChange={(event) => setExerciseForm({ ...exerciseForm, notes: event.target.value })}
                  />
                </div>

                <button className="btn-primary w-full" type="submit" disabled={creatingExercise}>
                  <Plus className="h-4 w-4" aria-hidden />
                  {creatingExercise ? "Adicionando..." : "Adicionar exercicio"}
                </button>
              </form>
            </section>
          ) : null}

          <section className="space-y-4">
            {groupedExercises.length === 0 ? (
              <div className="panel p-6">
                <EmptyState
                  icon={Dumbbell}
                  title="Nenhum exercicio cadastrado"
                  hint={canEdit ? "Use o formulario acima para criar a primeira secao do treino." : "Os exercicios da ficha aparecerao aqui."}
                />
              </div>
            ) : (
              groupedExercises.map((section) => (
                <section key={section.group} className="panel overflow-hidden">
                  <header className="flex flex-col gap-3 border-b border-line bg-paper/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Grupo muscular</p>
                      <h2 className="mt-1 text-lg font-bold tracking-tight text-ink">{section.group}</h2>
                    </div>
                    <div className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink/60">
                      {section.entries.filter((exercise) => exercise.is_active).length} ativos de {section.entries.length}
                    </div>
                  </header>

                  <div className="divide-y divide-line/80">
                    {section.entries.map((exercise) => {
                      const draft = mediaForms[exercise.id] ?? emptyMedia();
                      const activeMedia = exercise.media.filter((media) => media.is_active);
                      const metrics = exerciseMeta(exercise);
                      return (
                        <article
                          key={exercise.id}
                          className={`px-4 py-5 sm:px-5 ${exercise.is_active ? "bg-surface" : "bg-paper/70 opacity-80"}`}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-bold text-brand-dark">
                                  {exerciseNumberById.get(exercise.id) ?? "-"}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                    <h3 className="text-base font-bold tracking-tight text-ink">{exercise.name}</h3>
                                    <div className="w-fit">
                                      <StatusBadge value={exercise.is_active ? "ATIVO" : "INATIVO"} />
                                    </div>
                                  </div>
                                  <p className="mt-1 text-sm text-ink/55">
                                    {exercise.muscle_group || "Sem grupo muscular definido"}
                                  </p>
                                </div>
                              </div>

                              {metrics.length > 0 ? (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {metrics.map((metric) => (
                                    <ExercisePill key={`${exercise.id}-${metric}`} value={metric} />
                                  ))}
                                  <ExercisePill value={`Ordem ${exercise.sort_order}`} subdued />
                                </div>
                              ) : (
                                <div className="mt-4">
                                  <ExercisePill value={`Ordem ${exercise.sort_order}`} subdued />
                                </div>
                              )}

                              {exercise.notes ? (
                                <p className="mt-4 rounded-xl border border-line bg-paper px-3.5 py-3 text-sm leading-6 text-ink/75">
                                  {exercise.notes}
                                </p>
                              ) : null}
                            </div>

                            {canEdit && exercise.is_active ? (
                              <button
                                className="btn-secondary w-full lg:w-auto"
                                type="button"
                                onClick={() => deactivateExercise(exercise)}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                                Inativar
                              </button>
                            ) : null}
                          </div>

                          <details className="group mt-4 overflow-hidden rounded-xl border border-line bg-paper/70" open={activeMedia.length > 0}>
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                              <div>
                                <p className="text-sm font-semibold text-ink">Midias e orientacoes</p>
                                <p className="mt-0.5 text-xs text-ink/55">
                                  {activeMedia.length === 0 ? "Sem midias ativas" : `${activeMedia.length} item(ns) ativo(s)`}
                                </p>
                              </div>
                              <ChevronDown className="h-4 w-4 text-ink/50 transition group-open:rotate-180" aria-hidden />
                            </summary>

                            <div className="border-t border-line px-4 py-4">
                              {activeMedia.length === 0 ? (
                                <p className="text-sm text-ink/50">Nenhuma midia cadastrada para este exercicio.</p>
                              ) : (
                                <div className="grid gap-3 lg:grid-cols-2">
                                  {activeMedia.map((media) => (
                                    <MediaCard
                                      key={media.id}
                                      media={media}
                                      onDeactivate={canEdit ? () => deactivateMedia(media) : undefined}
                                    />
                                  ))}
                                </div>
                              )}

                              {canEdit && exercise.is_active ? (
                                <form
                                  onSubmit={(event) => addMedia(event, exercise)}
                                  className="mt-4 grid gap-3 rounded-xl border border-line bg-surface p-4 lg:grid-cols-2"
                                >
                                  <div>
                                    <label className="label" htmlFor={`media-type-${exercise.id}`}>Tipo</label>
                                    <select
                                      id={`media-type-${exercise.id}`}
                                      className="field"
                                      value={draft.media_type}
                                      onChange={(event) =>
                                        setMediaForms((current) => ({
                                          ...current,
                                          [exercise.id]: { ...draft, media_type: event.target.value as TrainingMediaType }
                                        }))
                                      }
                                    >
                                      <option value="EXTERNAL_VIDEO">Video externo</option>
                                      <option value="EXTERNAL_IMAGE">Imagem externa</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="label" htmlFor={`media-sort-${exercise.id}`}>Ordem da midia</label>
                                    <input
                                      id={`media-sort-${exercise.id}`}
                                      className="field"
                                      type="number"
                                      min="0"
                                      value={draft.sort_order}
                                      onChange={(event) =>
                                        setMediaForms((current) => ({
                                          ...current,
                                          [exercise.id]: { ...draft, sort_order: event.target.value }
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="lg:col-span-2">
                                    <label className="label" htmlFor={`media-url-${exercise.id}`}>URL externa</label>
                                    <input
                                      id={`media-url-${exercise.id}`}
                                      className="field"
                                      placeholder="https://..."
                                      value={draft.external_url}
                                      onChange={(event) =>
                                        setMediaForms((current) => ({
                                          ...current,
                                          [exercise.id]: { ...draft, external_url: event.target.value, file: null }
                                        }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="label" htmlFor={`media-file-${exercise.id}`}>Upload de imagem</label>
                                    <input
                                      id={`media-file-${exercise.id}`}
                                      className="field"
                                      type="file"
                                      accept=".jpg,.jpeg,.png,.webp"
                                      onChange={(event) =>
                                        setMediaForms((current) => ({
                                          ...current,
                                          [exercise.id]: { ...draft, file: event.target.files?.[0] ?? null, external_url: "" }
                                        }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="label" htmlFor={`media-title-${exercise.id}`}>Titulo</label>
                                    <input
                                      id={`media-title-${exercise.id}`}
                                      className="field"
                                      value={draft.title}
                                      onChange={(event) =>
                                        setMediaForms((current) => ({
                                          ...current,
                                          [exercise.id]: { ...draft, title: event.target.value }
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="lg:col-span-2">
                                    <label className="label" htmlFor={`media-description-${exercise.id}`}>Observacao da midia</label>
                                    <input
                                      id={`media-description-${exercise.id}`}
                                      className="field"
                                      value={draft.description}
                                      onChange={(event) =>
                                        setMediaForms((current) => ({
                                          ...current,
                                          [exercise.id]: { ...draft, description: event.target.value }
                                        }))
                                      }
                                    />
                                  </div>
                                  <button className="btn-secondary w-full lg:col-span-2" type="submit" disabled={addingMediaId !== null}>
                                    <ImagePlus className="h-4 w-4" aria-hidden />
                                    {addingMediaId === exercise.id ? "Adicionando..." : "Adicionar midia"}
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </details>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </section>
        </div>

        <aside className="order-1 space-y-5 xl:order-3 xl:col-span-2 2xl:col-span-1 2xl:sticky 2xl:top-5 2xl:self-start">
          <section id="link-aluno" className="panel p-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="panel-title">Link do aluno</h2>
                  <p className="mt-1 text-sm text-ink/55">
                    Envie a versao publica da ficha para o celular do aluno.
                  </p>
                </div>
                {shareLink ? <StatusBadge value="ATIVO" /> : null}
              </div>
            </div>

            {shareLink ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-line bg-paper px-3.5 py-3 text-xs font-medium text-ink/70 break-all">
                  {shareLink.public_url}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button className="btn-secondary w-full" type="button" onClick={copyLink}>
                    <Copy className="h-4 w-4" aria-hidden />
                    Copiar link
                  </button>
                  <a className="btn-secondary w-full" href={shareLink.public_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Abrir preview
                  </a>
                  <a
                    className="btn-primary w-full sm:col-span-2"
                    href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Share2 className="h-4 w-4" aria-hidden />
                    Enviar pelo WhatsApp
                  </a>
                  {canEdit ? (
                    <button className="btn-danger w-full sm:col-span-2" type="button" onClick={revokeLink}>
                      Revogar link
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={Link2}
                  title="Sem link publico ativo"
                  hint={canEdit ? "Gere o link quando a ficha estiver pronta para envio." : "Peça ao ADMIN ou PROFESSOR para gerar o link."}
                />
                {canEdit ? (
                  <button className="btn-primary mt-3 w-full" type="button" onClick={generateLink} disabled={sharing}>
                    <Link2 className="h-4 w-4" aria-hidden />
                    {sharing ? "Gerando..." : "Gerar link do aluno"}
                  </button>
                ) : null}
              </div>
            )}
          </section>

          <StudentPreviewPhone
            plan={plan}
            groups={publicPreviewGroups}
            shareLink={shareLink}
            estimatedDuration={estimatedDuration}
          />
        </aside>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper px-4 py-3">
      <div className="flex items-center gap-2 text-ink/55">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-brand">
          {icon}
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-3 text-lg font-bold tracking-tight text-ink">{value}</p>
    </div>
  );
}

function ExercisePill({ value, subdued = false }: { value: string; subdued?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        subdued ? "bg-paper text-ink/60" : "bg-brand-soft text-brand-dark"
      }`}
    >
      {value}
    </span>
  );
}

function MediaCard({
  media,
  onDeactivate
}: {
  media: TrainingPlanExerciseMedia;
  onDeactivate?: () => void;
}) {
  const href = media.external_url || mediaUrl(media.file_url);
  const isVideo = media.media_type.includes("VIDEO");
  const Icon = isVideo ? PlayCircle : ImageIcon;

  return (
    <div className="rounded-xl border border-line bg-paper p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{media.title || mediaLabels[media.media_type]}</p>
          <p className="mt-0.5 text-xs text-ink/55">{mediaLabels[media.media_type]}</p>
        </div>
        {onDeactivate ? (
          <button className="btn-ghost px-2" type="button" aria-label="Inativar midia" onClick={onDeactivate}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {media.description ? (
        <p className="mt-3 text-sm leading-6 text-ink/70">{media.description}</p>
      ) : null}

      {href ? (
        <a
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          <Icon className="h-4 w-4" aria-hidden />
          Abrir midia
        </a>
      ) : null}
    </div>
  );
}

function StudentPreviewPhone({
  plan,
  groups,
  shareLink,
  estimatedDuration
}: {
  plan: TrainingPlan;
  groups: ExerciseGroupSection[];
  shareLink: TrainingPlanShareLink | null;
  estimatedDuration: number | null;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="panel-title">Previa do aluno</h2>
        <p className="mt-1 text-sm text-ink/55">
          Como a ficha se adapta no celular e tambem em telas maiores.
        </p>
      </div>

      <div className="bg-paper/80 px-4 py-5 sm:px-5">
        <div className="mx-auto max-w-full rounded-[28px] border border-line bg-surface shadow-[0_18px_40px_rgba(16,25,21,0.12)] sm:max-w-[290px] sm:rounded-[32px] sm:border-[10px] sm:border-ink sm:bg-ink sm:shadow-[0_22px_45px_rgba(16,25,21,0.24)]">
          <div className="mx-auto mt-3 hidden h-6 w-28 rounded-full bg-black/85 sm:block" />
          <div className="rounded-[22px] bg-surface px-4 pb-5 pt-4 sm:h-[560px] sm:overflow-y-auto">
            <div className="flex items-center justify-between text-[11px] font-semibold text-ink/50">
              <span>AC Academia</span>
              <span>{shareLink ? "Link ativo" : "Preview interno"}</span>
            </div>

            <div className="mt-4 rounded-2xl border border-line bg-paper p-4 shadow-[0_8px_20px_rgba(16,25,21,0.06)]">
              <p className="text-xl font-bold tracking-tight text-ink">{plan.name}</p>
              <p className="mt-1 text-sm font-semibold text-brand">{plan.student?.name || "Aluno"}</p>
              {plan.objective ? <p className="mt-3 text-sm leading-6 text-ink/65">{plan.objective}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                {estimatedDuration ? (
                  <span className="rounded-full bg-surface px-2.5 py-1 text-ink/65">{estimatedDuration} min</span>
                ) : null}
                {plan.start_date ? (
                  <span className="rounded-full bg-surface px-2.5 py-1 text-ink/65">{formatDate(plan.start_date)}</span>
                ) : null}
                {plan.reassessment_date ? (
                  <span className="rounded-full bg-surface px-2.5 py-1 text-ink/65">
                    Reavaliacao {formatDate(plan.reassessment_date)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {groups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-ink/50">
                  Esta ficha ainda nao tem exercicios ativos.
                </div>
              ) : (
                groups.map((group) => (
                  <section key={group.group} className="rounded-2xl border border-line bg-paper p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink/50">{group.group}</p>
                      <span className="text-[11px] font-semibold text-ink/45">{group.entries.length}</span>
                    </div>
                    <div className="mt-3 space-y-2.5">
                      {group.entries.map((exercise) => (
                        <div key={exercise.id} className="rounded-xl border border-line bg-surface px-3 py-2.5">
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-xs font-bold text-brand-dark">
                              {exercise.sort_order}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink">{exercise.name}</p>
                              {exerciseMeta(exercise).length > 0 ? (
                                <p className="mt-1 text-xs text-ink/60">{exerciseMeta(exercise).join(" · ")}</p>
                              ) : null}
                              {exercise.notes ? (
                                <p className="mt-2 text-xs leading-5 text-ink/55">{exercise.notes}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>

            {plan.notes ? (
              <div className="mt-4 rounded-2xl border border-warning/20 bg-warning-soft px-3.5 py-3 text-sm text-warning">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p>{plan.notes}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
