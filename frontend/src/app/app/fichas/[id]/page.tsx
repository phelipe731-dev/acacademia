"use client";

import {
  Copy,
  Dumbbell,
  ImagePlus,
  Link2,
  Plus,
  Save,
  Share2,
  Trash2,
  Video
} from "lucide-react";
import Link from "next/link";
import { FormEvent, use, useEffect, useState } from "react";

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

const emptyExercise = {
  name: "",
  muscle_group: "",
  sets: "",
  repetitions: "",
  load: "",
  rest: "",
  notes: "",
  sort_order: "0"
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
      setExerciseForm(emptyExercise);
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
        <div className="panel p-5"><SkeletonRows rows={5} /></div>
      </div>
    );
  }

  if (!plan) {
    return <Message message={message?.text || "Ficha de treino nao encontrada."} type="error" />;
  }

  const whatsappMessage = `Ola, ${plan.student?.name || "aluno"}! Segue sua ficha de treino digital:\n${shareLink?.public_url || ""}\n\nQualquer duvida, fale com a equipe da academia.`;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title={plan.name} subtitle={plan.student ? `Ficha de ${plan.student.name}` : "Ficha de treino"}>
        <Link className="btn-secondary" href={`/app/alunos/${plan.student_id}`}>
          Voltar ao aluno
        </Link>
      </PageHeader>

      {message ? <Message message={message.text} type={message.type} /> : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <form onSubmit={savePlan} className="panel p-5">
          <h2 className="panel-title">Dados da ficha</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="plan-name">Nome</label>
              <input id="plan-name" className="field" disabled={!canEdit} value={plan.name} onChange={(event) => setPlan({ ...plan, name: event.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="plan-objective">Objetivo</label>
              <input id="plan-objective" className="field" disabled={!canEdit} value={plan.objective || ""} onChange={(event) => setPlan({ ...plan, objective: event.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="plan-start">Inicio</label>
              <input id="plan-start" className="field" disabled={!canEdit} type="date" value={plan.start_date || ""} onChange={(event) => setPlan({ ...plan, start_date: event.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="plan-review">Reavaliacao</label>
              <input id="plan-review" className="field" disabled={!canEdit} type="date" value={plan.reassessment_date || ""} onChange={(event) => setPlan({ ...plan, reassessment_date: event.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="plan-status">Status</label>
              <select id="plan-status" className="field" disabled={!canEdit} value={plan.is_active ? "ATIVO" : "INATIVO"} onChange={(event) => setPlan({ ...plan, is_active: event.target.value === "ATIVO" })}>
                <option value="ATIVO">Ativa</option>
                <option value="INATIVO">Inativa</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="plan-notes">Observacoes</label>
              <textarea id="plan-notes" className="field" disabled={!canEdit} rows={3} value={plan.notes || ""} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} />
            </div>
            {canEdit ? (
              <button className="btn-primary md:col-span-2" type="submit" disabled={savingPlan}>
                <Save className="h-4 w-4" aria-hidden />
                {savingPlan ? "Salvando..." : "Salvar ficha"}
              </button>
            ) : null}
          </div>
        </form>

        <aside className="panel p-5">
          <h2 className="panel-title">Link para aluno</h2>
          {shareLink ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-line bg-paper p-3 text-xs font-medium text-ink/70 break-all">
                {shareLink.public_url}
              </div>
              <div className="grid gap-2">
                <button className="btn-secondary w-full" type="button" onClick={copyLink}>
                  <Copy className="h-4 w-4" aria-hidden />
                  Copiar link
                </button>
                <a className="btn-primary w-full" href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`} target="_blank" rel="noreferrer">
                  <Share2 className="h-4 w-4" aria-hidden />
                  Enviar pelo WhatsApp
                </a>
                {canEdit ? (
                  <button className="btn-danger w-full" type="button" onClick={revokeLink}>
                    Revogar link
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState icon={Link2} title="Sem link publico ativo" hint={canEdit ? "Gere um link para enviar ao aluno." : "Peça ao ADMIN ou PROFESSOR para gerar o link."} />
              {canEdit ? (
                <button className="btn-primary mt-3 w-full" type="button" onClick={generateLink} disabled={sharing}>
                  <Link2 className="h-4 w-4" aria-hidden />
                  {sharing ? "Gerando..." : "Gerar link para aluno"}
                </button>
              ) : null}
            </div>
          )}
        </aside>
      </section>

      {canEdit ? (
        <form onSubmit={createExercise} className="panel p-5">
          <h2 className="panel-title">Novo exercicio</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="label" htmlFor="exercise-name">Exercicio</label>
              <input id="exercise-name" className="field" required value={exerciseForm.name} onChange={(event) => setExerciseForm({ ...exerciseForm, name: event.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="exercise-group">Grupo muscular</label>
              <input id="exercise-group" className="field" value={exerciseForm.muscle_group} onChange={(event) => setExerciseForm({ ...exerciseForm, muscle_group: event.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="exercise-order">Ordem</label>
              <input id="exercise-order" className="field" type="number" min="0" value={exerciseForm.sort_order} onChange={(event) => setExerciseForm({ ...exerciseForm, sort_order: event.target.value })} />
            </div>
            <input className="field" placeholder="Series" value={exerciseForm.sets} onChange={(event) => setExerciseForm({ ...exerciseForm, sets: event.target.value })} aria-label="Series" />
            <input className="field" placeholder="Repeticoes" value={exerciseForm.repetitions} onChange={(event) => setExerciseForm({ ...exerciseForm, repetitions: event.target.value })} aria-label="Repeticoes" />
            <input className="field" placeholder="Carga" value={exerciseForm.load} onChange={(event) => setExerciseForm({ ...exerciseForm, load: event.target.value })} aria-label="Carga" />
            <input className="field" placeholder="Descanso" value={exerciseForm.rest} onChange={(event) => setExerciseForm({ ...exerciseForm, rest: event.target.value })} aria-label="Descanso" />
            <div className="md:col-span-3">
              <label className="label" htmlFor="exercise-notes">Observacao</label>
              <input id="exercise-notes" className="field" value={exerciseForm.notes} onChange={(event) => setExerciseForm({ ...exerciseForm, notes: event.target.value })} />
            </div>
            <button className="btn-primary" type="submit" disabled={creatingExercise}>
              <Plus className="h-4 w-4" aria-hidden />
              {creatingExercise ? "Adicionando..." : "Adicionar"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="panel p-5">
        <h2 className="panel-title">Exercicios</h2>
        <div className="mt-4 space-y-3">
          {plan.exercises.length === 0 ? (
            <EmptyState icon={Dumbbell} title="Nenhum exercicio cadastrado" />
          ) : (
            plan.exercises.map((exercise) => {
              const draft = mediaForms[exercise.id] ?? emptyMedia();
              return (
                <article key={exercise.id} className={`rounded-lg border p-4 ${exercise.is_active ? "border-line bg-surface" : "border-line bg-paper opacity-75"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-ink">{exercise.name}</h3>
                        <StatusBadge value={exercise.is_active ? "ATIVO" : "INATIVO"} />
                      </div>
                      <p className="mt-1 text-sm text-ink/55">{exercise.muscle_group || "Sem grupo muscular"}</p>
                    </div>
                    {canEdit && exercise.is_active ? (
                      <button className="btn-secondary w-full px-3 sm:w-auto" type="button" onClick={() => deactivateExercise(exercise)}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Inativar
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                    <Info label="Series" value={exercise.sets} />
                    <Info label="Repeticoes" value={exercise.repetitions} />
                    <Info label="Carga" value={exercise.load} />
                    <Info label="Descanso" value={exercise.rest} />
                    <Info label="Ordem" value={exercise.sort_order} />
                  </div>
                  {exercise.notes ? <p className="mt-3 rounded-lg bg-paper p-3 text-sm text-ink/70">{exercise.notes}</p> : null}

                  <div className="mt-4 border-t border-line pt-4">
                    <h4 className="text-sm font-bold text-ink">Midias do exercicio</h4>
                    {exercise.media.filter((media) => media.is_active).length === 0 ? (
                      <p className="mt-2 text-sm text-ink/50">Nenhuma midia cadastrada.</p>
                    ) : (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {exercise.media.filter((media) => media.is_active).map((media) => (
                          <div key={media.id} className="rounded-lg border border-line bg-paper p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-ink">{media.title || mediaLabels[media.media_type]}</p>
                                <p className="text-xs text-ink/55">{mediaLabels[media.media_type]}</p>
                              </div>
                              {canEdit ? (
                                <button className="btn-ghost px-2" type="button" aria-label="Inativar midia" onClick={() => deactivateMedia(media)}>
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </button>
                              ) : null}
                            </div>
                            {media.external_url || media.file_url ? (
                              <a className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline" href={media.external_url || mediaUrl(media.file_url)} target="_blank" rel="noreferrer">
                                {media.media_type.includes("VIDEO") ? <Video className="h-4 w-4" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
                                Abrir midia
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}

                    {canEdit && exercise.is_active ? (
                      <form onSubmit={(event) => addMedia(event, exercise)} className="mt-4 grid gap-3 rounded-lg border border-line bg-paper/60 p-3 md:grid-cols-[160px_1fr_1fr_auto] md:items-end">
                        <div>
                          <label className="label" htmlFor={`media-type-${exercise.id}`}>Tipo</label>
                          <select
                            id={`media-type-${exercise.id}`}
                            className="field"
                            value={draft.media_type}
                            onChange={(event) => setMediaForms((current) => ({
                              ...current,
                              [exercise.id]: { ...draft, media_type: event.target.value as TrainingMediaType }
                            }))}
                          >
                            <option value="EXTERNAL_VIDEO">Video externo</option>
                            <option value="EXTERNAL_IMAGE">Imagem externa</option>
                          </select>
                        </div>
                        <div>
                          <label className="label" htmlFor={`media-url-${exercise.id}`}>URL externa</label>
                          <input
                            id={`media-url-${exercise.id}`}
                            className="field"
                            placeholder="https://..."
                            value={draft.external_url}
                            onChange={(event) => setMediaForms((current) => ({
                              ...current,
                              [exercise.id]: { ...draft, external_url: event.target.value, file: null }
                            }))}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor={`media-file-${exercise.id}`}>Upload imagem</label>
                          <input
                            id={`media-file-${exercise.id}`}
                            className="field"
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp"
                            onChange={(event) => setMediaForms((current) => ({
                              ...current,
                              [exercise.id]: { ...draft, file: event.target.files?.[0] ?? null, external_url: "" }
                            }))}
                          />
                        </div>
                        <button className="btn-secondary w-full" type="submit" disabled={addingMediaId !== null}>
                          <ImagePlus className="h-4 w-4" aria-hidden />
                          {addingMediaId === exercise.id ? "Adicionando..." : "Adicionar midia"}
                        </button>
                        <div className="md:col-span-2">
                          <label className="label" htmlFor={`media-title-${exercise.id}`}>Titulo</label>
                          <input
                            id={`media-title-${exercise.id}`}
                            className="field"
                            value={draft.title}
                            onChange={(event) => setMediaForms((current) => ({
                              ...current,
                              [exercise.id]: { ...draft, title: event.target.value }
                            }))}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="label" htmlFor={`media-description-${exercise.id}`}>Observacao da midia</label>
                          <input
                            id={`media-description-${exercise.id}`}
                            className="field"
                            value={draft.description}
                            onChange={(event) => setMediaForms((current) => ({
                              ...current,
                              [exercise.id]: { ...draft, description: event.target.value }
                            }))}
                          />
                        </div>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-lg bg-paper px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-ink">{value || "-"}</p>
    </div>
  );
}
