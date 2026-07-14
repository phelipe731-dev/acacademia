"use client";

import { BarChart3, Boxes, LogIn, UserPlus, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch, saveProfile } from "@/lib/api";
import type { Session, User } from "@/lib/types";
import { Message } from "@/components/Message";

const highlights = [
  { icon: Users, title: "Alunos e mensalidades", text: "Cadastro, historico financeiro e inadimplencia automatica." },
  { icon: Boxes, title: "Estoque e vendas", text: "Baixa automatica no balcao e alerta de estoque minimo." },
  { icon: BarChart3, title: "Indicadores reais", text: "Dashboard, frequencia e relatorios com exportacao." }
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showFirstAccess, setShowFirstAccess] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const session = await apiFetch<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      saveProfile(session.user);
      router.push("/app");
    } catch (error) {
      setMessage({ text: error instanceof ApiError ? error.message : "Erro ao entrar.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const user = await apiFetch<User>("/auth/register-admin", {
        method: "POST",
        body: JSON.stringify({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          role: "ADMIN",
          is_active: true
        })
      });
      setEmail(user.email);
      setPassword(adminPassword);
      setShowFirstAccess(false);
      setMessage({ text: "Administrador criado. Confirme os dados e entre.", type: "success" });
    } catch (error) {
      setMessage({ text: error instanceof ApiError ? error.message : "Erro ao criar administrador.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Painel institucional */}
      <section className="relative hidden overflow-hidden bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-brand/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-48 -left-24 h-[420px] w-[420px] rounded-full bg-brand/10 blur-3xl"
          aria-hidden
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-ink ring-1 ring-white/10 shadow-lift">
            <Image src="/logo.png" alt="AC Suplementos" width={48} height={48} className="h-full w-full object-cover" priority />
          </span>
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-tight text-white">AC Suplementos</div>
            <div className="text-xs font-medium text-white/40">Foco - Forca - Resultados</div>
          </div>
        </div>

        <div className="relative max-w-lg">
          <div className="mb-8 flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-ink ring-1 ring-white/10 shadow-lift">
            <Image src="/logo.png" alt="AC Suplementos" width={112} height={112} className="h-full w-full object-cover" priority />
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
            A operacao da sua academia, <span className="text-brand-200">organizada em um so lugar</span>.
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-white/50">
            Alunos, mensalidades, frequencia, estoque e vendas — com indicadores em tempo real para decidir melhor.
          </p>
          <div className="mt-10 space-y-5">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-brand-200">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-white/45">{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="relative text-xs text-white/30">AC Academia — sistema interno de gestao.</p>
      </section>

      {/* Formulario */}
      <section className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
        <div className="w-full max-w-[400px] animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-ink ring-1 ring-black/10">
              <Image src="/logo.png" alt="AC Suplementos" width={44} height={44} className="h-full w-full object-cover" priority />
            </span>
            <div className="leading-tight">
              <div className="text-lg font-bold tracking-tight text-ink">AC Suplementos</div>
              <div className="text-xs font-medium text-ink/55">Foco - Forca - Resultados</div>
            </div>
          </div>

          {!showFirstAccess ? (
            <form onSubmit={handleLogin} className="panel space-y-5 p-7">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-ink">Bem-vindo de volta</h2>
                <p className="mt-1 text-sm text-ink/55">Entre com a sua conta para acessar o sistema.</p>
              </div>
              {message ? <Message message={message.text} type={message.type} /> : null}
              <div>
                <label className="label" htmlFor="login-email">E-mail</label>
                <input
                  id="login-email"
                  className="field"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="voce@academia.com.br"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label" htmlFor="login-password">Senha</label>
                <input
                  id="login-password"
                  className="field"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder="Sua senha"
                  required
                  autoComplete="current-password"
                />
              </div>
              <button className="btn-primary w-full" type="submit" disabled={loading}>
                <LogIn className="h-4 w-4" aria-hidden />
                {loading ? "Entrando..." : "Entrar"}
              </button>
              <button
                className="w-full text-center text-[13px] font-medium text-ink/50 transition hover:text-brand"
                type="button"
                onClick={() => {
                  setShowFirstAccess(true);
                  setMessage(null);
                }}
              >
                Primeiro acesso? Criar administrador
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreateAdmin} className="panel space-y-5 p-7">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-ink">Primeiro acesso</h2>
                <p className="mt-1 text-sm text-ink/55">
                  Crie a conta do administrador. Disponivel apenas enquanto nao houver usuarios.
                </p>
              </div>
              {message ? <Message message={message.text} type={message.type} /> : null}
              <div>
                <label className="label" htmlFor="admin-name">Nome</label>
                <input
                  id="admin-name"
                  className="field"
                  value={adminName}
                  onChange={(event) => setAdminName(event.target.value)}
                  placeholder="Nome completo"
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="label" htmlFor="admin-email">E-mail</label>
                <input
                  id="admin-email"
                  className="field"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  type="email"
                  placeholder="admin@academia.com.br"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label" htmlFor="admin-password">Senha</label>
                <input
                  id="admin-password"
                  className="field"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  type="password"
                  placeholder="Minimo de 6 caracteres"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <button className="btn-primary w-full" type="submit" disabled={loading}>
                <UserPlus className="h-4 w-4" aria-hidden />
                {loading ? "Criando..." : "Criar administrador"}
              </button>
              <button
                className="w-full text-center text-[13px] font-medium text-ink/50 transition hover:text-brand"
                type="button"
                onClick={() => {
                  setShowFirstAccess(false);
                  setMessage(null);
                }}
              >
                Voltar para o login
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
