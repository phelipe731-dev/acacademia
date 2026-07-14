"use client";

import { Download, FileBarChart, Filter } from "lucide-react";
import { useEffect, useState } from "react";

import { Message } from "@/components/Message";
import { EmptyState, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiDownload, apiFetch, formatDate, formatMoney } from "@/lib/api";
import type {
  DefaulterReportRow,
  PaymentReportRow,
  Product,
  RevenueReport,
  SaleReportRow,
  TopProduct
} from "@/lib/types";

function firstDayOfMonth() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [payments, setPayments] = useState<PaymentReportRow[]>([]);
  const [defaulters, setDefaulters] = useState<DefaulterReportRow[]>([]);
  const [sales, setSales] = useState<SaleReportRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    const [paymentRows, defaulterRows, saleRows, topRows, lowRows, revenueData] = await Promise.all([
      apiFetch<PaymentReportRow[]>(`/reports/payments-received?${params.toString()}`),
      apiFetch<DefaulterReportRow[]>("/reports/defaulters"),
      apiFetch<SaleReportRow[]>(`/reports/sales?${params.toString()}`),
      apiFetch<TopProduct[]>(`/reports/top-products?${params.toString()}`),
      apiFetch<Product[]>("/reports/low-stock"),
      apiFetch<RevenueReport>(`/reports/revenue?${params.toString()}`)
    ]);
    setPayments(paymentRows);
    setDefaulters(defaulterRows);
    setSales(saleRows);
    setTopProducts(topRows);
    setLowStock(lowRows);
    setRevenue(revenueData);
  }

  function refresh() {
    setLoading(true);
    setMessage(null);
    load()
      .catch((error) => setMessage(getErrorMessage(error, "Erro ao carregar relatorios.")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reportPath(path: string) {
    return `${path}?${new URLSearchParams({ start_date: startDate, end_date: endDate }).toString()}`;
  }

  async function handleExport(path: string, filename: string) {
    try {
      await apiDownload(path, filename);
    } catch (error) {
      setMessage(getErrorMessage(error, "Erro ao exportar o CSV."));
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Relatorios" subtitle="Tabelas simples com filtros por periodo." />

      {message ? <Message message={message} type="error" /> : null}

      <section className="panel grid gap-3 p-5 md:grid-cols-[180px_180px_auto] md:items-end">
        <div>
          <label className="label" htmlFor="report-start-date">Data inicial</label>
          <input
            id="report-start-date"
            className="field"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="report-end-date">Data final</label>
          <input
            id="report-end-date"
            className="field"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <button className="btn-primary w-full sm:w-auto" type="button" onClick={refresh} disabled={loading}>
          <Filter className="h-4 w-4" aria-hidden />
          Filtrar
        </button>
      </section>

      {loading ? (
        <section className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="skeleton h-[104px]" />
          ))}
        </section>
      ) : revenue ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="panel p-5">
            <p className="text-[13px] font-medium text-ink/60">Mensalidades</p>
            <p className="mt-1.5 text-[26px] font-bold leading-none tracking-tight text-ink">
              {formatMoney(revenue.payments_total)}
            </p>
          </div>
          <div className="panel p-5">
            <p className="text-[13px] font-medium text-ink/60">Vendas</p>
            <p className="mt-1.5 text-[26px] font-bold leading-none tracking-tight text-ink">
              {formatMoney(revenue.sales_total)}
            </p>
          </div>
          <div className="panel p-5">
            <p className="text-[13px] font-medium text-ink/60">Receita geral</p>
            <p className="mt-1.5 text-[26px] font-bold leading-none tracking-tight text-ink">
              {formatMoney(revenue.total)}
            </p>
            <button
              className="btn-secondary mt-3 px-3"
              type="button"
              aria-label="Exportar receita geral em CSV"
              title="Exportar receita geral"
              onClick={() => handleExport(reportPath("/reports/revenue.csv"), "receita-geral.csv")}
            >
              <Download className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </section>
      ) : null}

      <ReportBlock
        title="Mensalidades recebidas"
        loading={loading}
        onExport={() => handleExport(reportPath("/reports/payments-received.csv"), "mensalidades-recebidas.csv")}
        empty="Sem mensalidades recebidas no periodo."
        rows={payments}
        render={(row) => (
          <div key={row.id} className="grid gap-2 rounded-lg border border-line px-3.5 py-3 text-sm transition hover:bg-paper/70 md:grid-cols-5">
            <ReportCell label="Aluno" strong>{row.student_name}</ReportCell>
            <ReportCell label="Valor">{formatMoney(row.amount)}</ReportCell>
            <ReportCell label="Pagamento">{formatDate(row.paid_at)}</ReportCell>
            <ReportCell label="Vencimento">{formatDate(row.due_date)}</ReportCell>
            <ReportCell label="Forma">{row.payment_method}</ReportCell>
          </div>
        )}
      />

      <ReportBlock
        title="Inadimplentes"
        loading={loading}
        onExport={() => handleExport("/reports/defaulters.csv", "inadimplentes.csv")}
        empty="Sem inadimplentes."
        rows={defaulters}
        render={(row) => (
          <div key={row.student_id} className="grid gap-2 rounded-lg border border-line px-3.5 py-3 text-sm transition hover:bg-paper/70 md:grid-cols-4">
            <ReportCell label="Aluno" strong>{row.student_name}</ReportCell>
            <ReportCell label="Telefone">{row.phone}</ReportCell>
            <ReportCell label="Em atraso">{formatMoney(row.overdue_amount)}</ReportCell>
            <ReportCell label="Mais antigo">{formatDate(row.oldest_due_date)}</ReportCell>
          </div>
        )}
      />

      <ReportBlock
        title="Vendas de suplementos"
        loading={loading}
        onExport={() => handleExport(reportPath("/reports/sales.csv"), "vendas.csv")}
        empty="Sem vendas no periodo."
        rows={sales}
        render={(row) => (
          <div key={row.id} className="grid gap-2 rounded-lg border border-line px-3.5 py-3 text-sm transition hover:bg-paper/70 md:grid-cols-5">
            <ReportCell label="Venda" strong>#{row.id}</ReportCell>
            <ReportCell label="Data">{formatDate(row.created_at)}</ReportCell>
            <ReportCell label="Total">{formatMoney(row.total_amount)}</ReportCell>
            <ReportCell label="Forma">{row.payment_method}</ReportCell>
            <ReportCell label="Itens">{row.items_count} un.</ReportCell>
          </div>
        )}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <ReportBlock
          title="Produtos mais vendidos"
          loading={loading}
          onExport={() => handleExport(reportPath("/reports/top-products.csv"), "produtos-mais-vendidos.csv")}
          empty="Sem produtos vendidos no periodo."
          rows={topProducts}
          render={(row) => (
            <div key={row.product_id} className="grid gap-2 rounded-lg border border-line px-3.5 py-3 text-sm transition hover:bg-paper/70 md:grid-cols-3">
              <ReportCell label="Produto" strong>{row.name}</ReportCell>
              <ReportCell label="Quantidade">{row.quantity} un.</ReportCell>
              <ReportCell label="Total">{formatMoney(row.total)}</ReportCell>
            </div>
          )}
        />
        <ReportBlock
          title="Estoque baixo"
          loading={loading}
          onExport={() => handleExport("/reports/low-stock.csv", "estoque-baixo.csv")}
          empty="Nenhum produto com estoque baixo."
          rows={lowStock}
          render={(row) => (
            <div key={row.id} className="grid gap-2 rounded-lg border border-line px-3.5 py-3 text-sm transition hover:bg-paper/70 md:grid-cols-3">
              <ReportCell label="Produto" strong>{row.name}</ReportCell>
              <ReportCell label="Estoque">{row.stock_quantity} un.</ReportCell>
              <ReportCell label="Minimo">{row.min_stock} un.</ReportCell>
            </div>
          )}
        />
      </section>
    </div>
  );
}

function ReportCell({
  label,
  children,
  strong = false
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <span className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink/45 md:hidden">{label}</span>
      <span className={`block break-words ${strong ? "font-semibold text-ink" : "text-ink/80"}`}>{children}</span>
    </span>
  );
}

function ReportBlock<T>({
  title,
  rows,
  empty,
  render,
  onExport,
  loading
}: {
  title: string;
  rows: T[];
  empty: string;
  render: (row: T) => React.ReactNode;
  onExport?: () => void;
  loading?: boolean;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="panel-title">{title}</h2>
        {onExport ? (
          <button
            className="btn-secondary px-3"
            type="button"
            aria-label={`Exportar ${title} em CSV`}
            title="Exportar CSV"
            onClick={onExport}
            disabled={loading}
          >
            <Download className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState icon={FileBarChart} title={empty} />
        ) : (
          rows.map(render)
        )}
      </div>
    </section>
  );
}
