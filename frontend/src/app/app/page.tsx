"use client";

import {
  AlertTriangle,
  Cake,
  CalendarClock,
  CreditCard,
  PackageSearch,
  ShoppingCart,
  TrendingUp,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";

import { Message } from "@/components/Message";
import { EmptyState, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatDate, formatMoney } from "@/lib/api";
import type { BirthdayRow, Dashboard, ExpiringPlanRow } from "@/lib/types";

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [birthdays, setBirthdays] = useState<BirthdayRow[]>([]);
  const [expiring, setExpiring] = useState<ExpiringPlanRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Dashboard>("/dashboard")
      .then(setDashboard)
      .catch((err) => setError(getErrorMessage(err, "Erro ao carregar o dashboard.")));
    apiFetch<BirthdayRow[]>("/students/birthdays")
      .then(setBirthdays)
      .catch(() => setBirthdays([]));
    apiFetch<ExpiringPlanRow[]>("/students/expiring-plans?days=15")
      .then(setExpiring)
      .catch(() => setExpiring([]));
  }, []);

  if (error) return <Message message={error} type="error" />;

  if (!dashboard) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Indicadores do mes atual." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skeleton h-[104px]" />
          ))}
        </div>
        <div className="panel p-5">
          <SkeletonRows rows={4} height="h-10" />
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Alunos ativos", value: dashboard.active_students, icon: Users, tone: "success" as const },
    { label: "Inadimplentes", value: dashboard.defaulter_students, icon: AlertTriangle, tone: "danger" as const },
    {
      label: "Mensalidades no mes",
      value: formatMoney(dashboard.payments_received_month),
      icon: CreditCard,
      tone: "brand" as const
    },
    {
      label: "Mensalidades em atraso",
      value: dashboard.overdue_payments,
      icon: AlertTriangle,
      tone: "warning" as const
    },
    { label: "Vendas no mes", value: formatMoney(dashboard.sales_month), icon: ShoppingCart, tone: "info" as const },
    { label: "Receita do mes", value: formatMoney(dashboard.revenue_month), icon: TrendingUp, tone: "brand" as const }
  ];

  const toneClasses = {
    brand: "bg-brand-soft text-brand",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    info: "bg-info-soft text-info",
    success: "bg-success-soft text-success-dark"
  };

  const maxRevenuePoint = Math.max(...dashboard.revenue_points.map((point) => Number(point.total)), 1);
  const maxTopProduct = Math.max(...dashboard.top_products.map((product) => product.quantity), 1);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Dashboard" subtitle="Indicadores reais do mes atual." />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="panel p-5 transition hover:shadow-lift">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink/60">{card.label}</p>
                  <p className="mt-1.5 text-[26px] font-bold leading-none tracking-tight text-ink">{card.value}</p>
                </div>
                <div className={`kpi-icon ${toneClasses[card.tone]}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="panel-title">Receita diaria do mes</h2>
            <div className="flex flex-wrap gap-4 text-xs font-medium text-ink/60">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-[4px] bg-brand" aria-hidden /> Mensalidades
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-[4px] bg-amber-500" aria-hidden /> Vendas
              </span>
            </div>
          </div>
          <div className="mt-5 flex h-56 items-end gap-1.5 overflow-x-auto border-b border-line pb-2">
            {dashboard.revenue_points.map((point) => {
              const total = Number(point.total);
              const height = Math.max(4, (total / maxRevenuePoint) * 180);
              const paymentHeight = total > 0 ? (Number(point.payments) / total) * height : 0;
              const salesHeight = Math.max(0, height - paymentHeight);
              return (
                <div key={point.label} className="flex min-w-7 flex-col items-center gap-1.5">
                  <div className="flex h-44 items-end">
                    <div
                      className="flex w-5 flex-col justify-end overflow-hidden rounded-t-md bg-ink/[0.05] transition hover:opacity-80"
                      title={`Dia ${point.label}: ${formatMoney(point.total)}`}
                    >
                      <div className="bg-brand" style={{ height: `${paymentHeight}px` }} />
                      <div className="bg-amber-500" style={{ height: `${salesHeight}px` }} />
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-ink/60">{point.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="panel-title">Estoque baixo</h2>
          <div className="mt-4 space-y-2">
            {dashboard.low_stock_products.length === 0 ? (
              <EmptyState icon={PackageSearch} title="Nenhum produto abaixo do minimo" />
            ) : (
              dashboard.low_stock_products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{product.name}</p>
                    <p className="text-xs text-ink/55">Minimo {product.min_stock} un.</p>
                  </div>
                  <span className="rounded-full bg-warning-soft px-2.5 py-1 text-sm font-bold text-warning">
                    {product.stock_quantity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="panel-title">Produtos mais vendidos</h2>
          <div className="mt-4 space-y-2">
            {dashboard.top_products.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="Sem vendas registradas neste mes" />
            ) : (
              dashboard.top_products.map((product) => (
                <div key={product.product_id} className="rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{product.name}</p>
                    <span className="text-sm font-bold text-brand">{product.quantity} un.</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink/55">{formatMoney(product.total)}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{ width: `${(product.quantity / maxTopProduct) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="panel-title flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-brand" aria-hidden /> Planos vencendo (15 dias)
          </h2>
          <div className="mt-4 space-y-2">
            {expiring.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nenhum plano vencendo em breve" />
            ) : (
              expiring.map((row) => (
                <div
                  key={row.student_id}
                  className="flex items-center justify-between rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{row.name}</p>
                    <p className="text-xs text-ink/55">
                      {row.plan} - vence {formatDate(row.plan_end_date)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      row.days_left < 0 ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-dark"
                    }`}
                  >
                    {row.days_left < 0 ? `${Math.abs(row.days_left)}d atras` : `${row.days_left}d`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="panel-title flex items-center gap-2">
            <Cake className="h-5 w-5 text-brand" aria-hidden /> Aniversariantes do mes
          </h2>
          <div className="mt-4 space-y-2">
            {birthdays.length === 0 ? (
              <EmptyState icon={Cake} title="Nenhum aniversariante neste mes" />
            ) : (
              birthdays.map((row) => (
                <div
                  key={row.student_id}
                  className="flex items-center justify-between rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{row.name}</p>
                    <p className="text-xs text-ink/55">{row.phone}</p>
                  </div>
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-dark">
                    dia {row.day}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
