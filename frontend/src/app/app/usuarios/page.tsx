"use client";

import { Trash2, UserPlus, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Message } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, MobileRecord, MobileRecordRow, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, getSession } from "@/lib/api";
import type { User, UserRole } from "@/lib/types";

export default function UsersPage() {
  const [role, setRole] = useState<UserRole>("RECEPCAO");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" | "info" } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "RECEPCAO" as UserRole
  });

  async function load() {
    setUsers(await apiFetch<User[]>("/users"));
  }

  useEffect(() => {
    const sessionRole = getSession()?.user.role ?? "RECEPCAO";
    setRole(sessionRole);
    if (sessionRole === "ADMIN") {
      load()
        .catch((error) => setMessage({ text: getErrorMessage(error, "Erro ao carregar usuarios."), type: "error" }))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiFetch<User>("/users", {
        method: "POST",
        body: JSON.stringify({ ...form, is_active: true })
      });
      setForm({ name: "", email: "", password: "", role: "RECEPCAO" });
      setMessage({ text: "Usuario criado.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao criar usuario."), type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivate(user: User) {
    if (!window.confirm(`Desativar ${user.name}?`)) return;
    try {
      await apiFetch(`/users/${user.id}`, { method: "DELETE" });
      setMessage({ text: "Usuario desativado.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao desativar usuario."), type: "error" });
    }
  }

  if (role !== "ADMIN") {
    return <Message message="Acesso restrito ao perfil ADMIN." type="error" />;
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Usuarios" subtitle="Perfis de acesso ADMIN, RECEPCAO e PROFESSOR." />

      {message ? <Message message={message.text} type={message.type} /> : null}

      <form onSubmit={handleCreate} className="panel grid gap-4 p-5 md:grid-cols-4">
        <h2 className="panel-title md:col-span-4">Novo usuario</h2>
        <div>
          <label className="label" htmlFor="user-name">Nome</label>
          <input
            id="user-name"
            className="field"
            required
            placeholder="Nome completo"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="user-email">E-mail</label>
          <input
            id="user-email"
            className="field"
            required
            type="email"
            placeholder="email@exemplo.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="user-password">Senha</label>
          <input
            id="user-password"
            className="field"
            required
            type="password"
            minLength={6}
            placeholder="Minimo 6 caracteres"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="user-role">Perfil</label>
          <select
            id="user-role"
            className="field"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
          >
            <option value="RECEPCAO">RECEPCAO</option>
            <option value="PROFESSOR">PROFESSOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <button className="btn-primary md:col-span-4" type="submit" disabled={submitting}>
          <UserPlus className="h-4 w-4" aria-hidden />
          {submitting ? "Criando..." : "Criar usuario"}
        </button>
      </form>

      <section className="panel p-5">
        <h2 className="panel-title">Equipe</h2>
        <div className="mt-4">
          {loading ? (
            <SkeletonRows rows={4} />
          ) : users.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum usuario encontrado" hint="Crie o primeiro usuario no formulario acima." />
          ) : (
            <>
              <div className="mobile-card-list">
                {users.map((user) => (
                  <MobileRecord
                    key={user.id}
                    title={user.name}
                    subtitle={user.email}
                    badge={<StatusBadge value={user.is_active ? "ATIVO" : "INATIVO"} />}
                    actions={
                      user.is_active ? (
                        <button
                          className="btn-secondary w-full sm:w-auto"
                          type="button"
                          aria-label={`Desativar ${user.name}`}
                          title="Desativar usuario"
                          onClick={() => deactivate(user)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Desativar
                        </button>
                      ) : undefined
                    }
                  >
                    <MobileRecordRow label="Perfil" value={user.role} />
                    <MobileRecordRow label="Status" value={user.is_active ? "Ativo" : "Inativo"} />
                  </MobileRecord>
                ))}
              </div>

              <div className="desktop-table-wrap">
                <table className="table-base min-w-[680px]">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>Perfil</th>
                      <th>Status</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="font-semibold text-ink">{user.name}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td><StatusBadge value={user.is_active ? "ATIVO" : "INATIVO"} /></td>
                        <td>
                          {user.is_active ? (
                            <button
                              className="btn-secondary px-3"
                              type="button"
                              aria-label={`Desativar ${user.name}`}
                              title="Desativar usuario"
                              onClick={() => deactivate(user)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          ) : (
                            <span className="text-xs text-ink/55">Desativado</span>
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
