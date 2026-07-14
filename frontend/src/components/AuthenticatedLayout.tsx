"use client";

import {
  BarChart3,
  Boxes,
  ClipboardList,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  ShoppingCart,
  UserCheck,
  Users,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, clearSession, getSession, logout as apiLogout, saveProfile } from "@/lib/api";
import type { User, UserRole } from "@/lib/types";

const navigation = [
  { section: "Operacao" },
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "RECEPCAO"] },
  { href: "/app/alunos", label: "Alunos", icon: Users, roles: ["ADMIN", "RECEPCAO", "PROFESSOR"] },
  { href: "/app/frequencia", label: "Frequencia", icon: UserCheck, roles: ["ADMIN", "RECEPCAO"] },
  { href: "/app/mensalidades", label: "Mensalidades", icon: CreditCard, roles: ["ADMIN", "RECEPCAO"] },
  { href: "/app/fichas", label: "Fichas de treino", icon: Dumbbell, roles: ["ADMIN", "PROFESSOR"] },
  { section: "Loja" },
  { href: "/app/produtos", label: "Produtos e estoque", icon: Boxes, roles: ["ADMIN", "RECEPCAO"] },
  { href: "/app/vendas", label: "Vendas", icon: ShoppingCart, roles: ["ADMIN", "RECEPCAO"] },
  { section: "Gestao" },
  { href: "/app/relatorios", label: "Relatorios", icon: BarChart3, roles: ["ADMIN", "RECEPCAO"] },
  { href: "/app/auditoria", label: "Auditoria", icon: ClipboardList, roles: ["ADMIN"] },
  { href: "/app/usuarios", label: "Usuarios", icon: ShieldCheck, roles: ["ADMIN"] }
] as const;

type NavEntry = (typeof navigation)[number];

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobilePanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    apiFetch<User>("/auth/me")
      .then((me) => {
        saveProfile(me);
        setUser(me);
      })
      .catch(() => {
        clearSession();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  // Menu mobile: fecha com Escape, trava o scroll do fundo e foca o painel.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobilePanelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  // Fecha o menu ao navegar.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const visibleNavigation = useMemo(() => {
    const entries: NavEntry[] = [];
    let pendingSection: NavEntry | null = null;
    const role = user?.role;
    navigation.forEach((item) => {
      if ("section" in item) {
        pendingSection = item;
        return;
      }
      const canSee = role ? (item.roles as readonly UserRole[]).includes(role) : false;
      if (!canSee) return;
      if (pendingSection) {
        entries.push(pendingSection);
        pendingSection = null;
      }
      entries.push(item);
    });
    return entries;
  }, [user]);

  async function logout() {
    await apiLogout();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-6 py-4 shadow-soft">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-brand" aria-hidden />
          <span className="text-sm font-semibold text-ink/80">Carregando sistema...</span>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* Topbar mobile */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            className="btn-ghost px-2.5"
            type="button"
            aria-label="Abrir menu de navegacao"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandMark compact />
          <button className="btn-ghost px-2.5" type="button" aria-label="Sair do sistema" onClick={logout}>
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Menu mobile (drawer) */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        >
          <aside
            ref={mobilePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegacao"
            tabIndex={-1}
            className="h-full w-80 max-w-[86vw] bg-sidebar shadow-lift outline-none animate-fade-up"
            onClick={(event) => event.stopPropagation()}
          >
            <SidebarContent
              pathname={pathname}
              user={user}
              items={visibleNavigation}
              onLogout={logout}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-[264px] bg-sidebar lg:block">
        <SidebarContent pathname={pathname} user={user} items={visibleNavigation} onLogout={logout} />
      </aside>

      <main className="lg:pl-[264px]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink ring-1 ring-white/10 ${
          compact ? "h-9 w-9" : "h-10 w-10"
        }`}
      >
        <Image src="/logo.png" alt="AC Suplementos" width={40} height={40} className="h-full w-full object-cover" priority />
      </span>
      {!compact ? (
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-white">AC Suplementos</div>
          <div className="text-[11px] font-medium text-white/40">Academia</div>
        </div>
      ) : (
        <span className="text-sm font-bold tracking-tight text-ink">AC Suplementos</span>
      )}
    </div>
  );
}

function SidebarContent({
  pathname,
  user,
  items,
  onLogout,
  onClose
}: {
  pathname: string;
  user: User | null;
  items: readonly NavEntry[];
  onLogout: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <BrandMark />
        {onClose ? (
          <button
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            type="button"
            aria-label="Fechar menu"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Navegacao principal">
        {items.map((item, index) => {
          if ("section" in item) {
            return (
              <p
                key={`section-${item.section}`}
                className={`px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/30 ${index === 0 ? "pt-2" : "pt-5"}`}
              >
                {item.section}
              </p>
            );
          }
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                active
                  ? "bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${active ? "" : "text-white/40 group-hover:text-white/80"}`} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-line p-4">
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-white/[0.04] p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/25 text-sm font-bold text-brand-200">
            {(user?.name ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold text-white">{user?.name}</div>
            <div className="truncate text-[11px] font-medium text-white/40">
              {user?.role === "ADMIN" ? "Administrador" : user?.role === "PROFESSOR" ? "Professor" : "Recepcao"}
            </div>
          </div>
        </div>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-line px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          type="button"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sair
        </button>
      </div>
    </div>
  );
}
