"use client";

import { ScrollText, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Message } from "@/components/Message";
import { EmptyState, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatDate, getSession } from "@/lib/api";
import type { AuditLog, UserRole } from "@/lib/types";

const entityTypes = ["", "USER", "STUDENT", "PAYMENT", "PRODUCT", "STOCK_MOVEMENT", "SALE"];
const actions = ["", "CREATE", "UPDATE", "DELETE", "DEACTIVATE", "PAY", "IMPORT", "GENERATE_MONTHLY", "ENTRADA", "AJUSTE", "SAIDA_VENDA"];

export default function AuditPage() {
  const [role, setRole] = useState<UserRole>("RECEPCAO");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const params = new URLSearchParams({ limit: "150" });
    if (entityType) params.set("entity_type", entityType);
    if (action) params.set("action", action);
    setLogs(await apiFetch<AuditLog[]>(`/audit-logs?${params.toString()}`));
  }

  useEffect(() => {
    const sessionRole = getSession()?.user.role ?? "RECEPCAO";
    setRole(sessionRole);
    if (sessionRole === "ADMIN") {
      load()
        .catch((error) => setMessage(getErrorMessage(error, "Erro ao carregar a auditoria.")))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter() {
    setLoading(true);
    setMessage(null);
    load()
      .catch((error) => setMessage(getErrorMessage(error, "Erro ao filtrar a auditoria.")))
      .finally(() => setLoading(false));
  }

  if (role !== "ADMIN") {
    return <Message message="Acesso restrito ao perfil ADMIN." type="error" />;
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Auditoria" subtitle="Registro de alteracoes sensiveis feitas no sistema." />

      {message ? <Message message={message} type="error" /> : null}

      <section className="panel grid gap-3 p-5 md:grid-cols-[180px_220px_auto] md:items-end">
        <div>
          <label className="label" htmlFor="audit-entity">Entidade</label>
          <select
            id="audit-entity"
            className="field"
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
          >
            {entityTypes.map((item) => (
              <option key={item || "ALL"} value={item}>{item || "Todas entidades"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="audit-action">Acao</label>
          <select
            id="audit-action"
            className="field"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            {actions.map((item) => (
              <option key={item || "ALL"} value={item}>{item || "Todas acoes"}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary w-full sm:w-auto" type="button" onClick={handleFilter} disabled={loading}>
          <Search className="h-4 w-4" aria-hidden />
          Filtrar
        </button>
      </section>

      <section className="panel p-5">
        <h2 className="panel-title">Eventos recentes</h2>
        <div className="mt-4">
          {loading ? (
            <SkeletonRows rows={4} />
          ) : logs.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Nenhum evento de auditoria encontrado"
              hint="Ajuste os filtros ou aguarde novas alteracoes no sistema."
            />
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <article key={log.id} className="rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{log.summary}</p>
                      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-ink/55">
                        {log.entity_type} · {log.action} · #{log.entity_id ?? "-"}
                      </p>
                    </div>
                    <div className="text-left text-xs text-ink/60 sm:text-right">
                      <p>{formatDate(log.created_at)}</p>
                      <p>{log.created_by?.name ?? "Sistema"}</p>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-brand">Ver dados</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-paper p-3 text-xs text-ink">
                      {JSON.stringify({ antes: log.before_data, depois: log.after_data }, null, 2)}
                    </pre>
                  </details>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
