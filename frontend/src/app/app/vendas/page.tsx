"use client";

import { CalendarDays, Eye, MoreHorizontal, Plus, Receipt, Search, ShoppingCart, Trash2, X, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Message } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatDate, formatMoney, getSession } from "@/lib/api";
import type { PaymentMethod, Product, Sale, SalePaymentMethod, Student } from "@/lib/types";

interface DraftItem {
  key: string;
  product_id: string;
  quantity: string;
}

interface SaleAdjustmentDraft {
  sale: Sale;
  paymentMethod: SalePaymentMethod;
  installmentsCount: string;
  installmentPaymentMethod: PaymentMethod;
  installmentDueDates: string[];
}

// O item inicial usa chave fixa para o HTML do servidor e do cliente coincidirem
// (o key entra em id/htmlFor); UUIDs so para itens adicionados depois (client-only).
function makeItem(key?: string): DraftItem {
  return { key: key ?? crypto.randomUUID(), product_id: "", quantity: "1" };
}

function todayDateInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addMonthsInput(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return todayDateInput();
  const base = new Date(year, month - 1, day);
  const target = new Date(base);
  target.setMonth(base.getMonth() + months);
  if (target.getDate() !== day) target.setDate(0);
  const local = new Date(target.getTime() - target.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const paymentMethods: SalePaymentMethod[] = ["DINHEIRO", "PIX", "CARTAO", "PRAZO", "OUTRO"];
const installmentMethods: PaymentMethod[] = ["PIX", "DINHEIRO", "CARTAO", "OUTRO"];

function salePaymentLabel(sale: Sale) {
  if (sale.payment_method !== "PRAZO") return sale.payment_method;
  const method = sale.installment_payment_method ? ` via ${sale.installment_payment_method}` : "";
  const firstInstallment = sale.installments?.[0];
  const due = firstInstallment ? ` · 1a vence ${formatDate(firstInstallment.due_date)}` : "";
  return `PRAZO · ${sale.installments_count}x${method}${due}`;
}

export default function SalesPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<DraftItem[]>(() => [makeItem("initial")]);
  const [studentId, setStudentId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("PIX");
  const [installmentsCount, setInstallmentsCount] = useState("1");
  const [installmentPaymentMethod, setInstallmentPaymentMethod] = useState<PaymentMethod>("PIX");
  const [installmentDueDates, setInstallmentDueDates] = useState<string[]>(() => [todayDateInput()]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingSaleId, setCancellingSaleId] = useState<number | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<SaleAdjustmentDraft | null>(null);
  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  const [openActionSaleId, setOpenActionSaleId] = useState<number | null>(null);
  const [saleSearch, setSaleSearch] = useState("");
  const [salePeriod, setSalePeriod] = useState("7");
  const [saleStatus, setSaleStatus] = useState("TODOS");
  const [salePayment, setSalePayment] = useState("TODOS");
  const [salePage, setSalePage] = useState(1);
  const [receivingInstallmentId, setReceivingInstallmentId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const canManageSales = ["ADMIN", "RECEPCAO"].includes(getSession()?.user.role ?? "");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedStudentId = params.get("student_id");
    const selectedPaymentMethod = params.get("payment_method") as SalePaymentMethod | null;
    if (selectedStudentId) setStudentId(selectedStudentId);
    if (selectedPaymentMethod && paymentMethods.includes(selectedPaymentMethod)) {
      setPaymentMethod(selectedPaymentMethod);
    }
  }, []);

  async function load() {
    const [studentsData, productsData, salesData] = await Promise.all([
      apiFetch<Student[]>("/students"),
      apiFetch<Product[]>("/products?available_for_sale=true"),
      apiFetch<Sale[]>("/sales")
    ]);
    setStudents(studentsData);
    setProducts(productsData);
    setSales(salesData);
  }

  useEffect(() => {
    load()
      .catch((error) => setMessage({ text: getErrorMessage(error, "Erro ao carregar vendas."), type: "error" }))
      .finally(() => setLoading(false));
  }, []);

  const total = useMemo(() => {
    return items.reduce((sum, item) => {
      const product = products.find((current) => current.id === Number(item.product_id));
      return sum + (product ? Number(product.sale_price) * Number(item.quantity || 0) : 0);
    }, 0);
  }, [items, products]);

  const filteredSales = useMemo(() => {
    const now = new Date();
    const periodDays = salePeriod === "todos" ? null : Number(salePeriod);
    const periodStart = periodDays ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - periodDays + 1) : null;
    const query = saleSearch.trim().toLowerCase();
    return sales.filter((sale) => {
      const createdAt = new Date(sale.created_at);
      const matchesQuery = !query || String(sale.id).includes(query) || (sale.student?.name || "").toLowerCase().includes(query);
      const matchesPeriod = !periodStart || createdAt >= periodStart;
      const matchesStatus = saleStatus === "TODOS" || (sale.status ?? "CONCLUIDA") === saleStatus;
      const matchesPayment = salePayment === "TODOS" || sale.payment_method === salePayment;
      return matchesQuery && matchesPeriod && matchesStatus && matchesPayment;
    });
  }, [salePayment, salePeriod, saleSearch, saleStatus, sales]);

  const salesPerPage = 8;
  const salesPageCount = Math.max(1, Math.ceil(filteredSales.length / salesPerPage));
  const visibleSales = filteredSales.slice((salePage - 1) * salesPerPage, salePage * salesPerPage);
  const todayKey = todayDateInput();
  const todaySales = sales.filter((sale) => sale.created_at.slice(0, 10) === todayKey && (sale.status ?? "CONCLUIDA") !== "CANCELADA");
  const todayTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const averageTicket = todaySales.length ? todayTotal / todaySales.length : 0;

  useEffect(() => {
    setSalePage((current) => Math.min(current, salesPageCount));
  }, [salesPageCount]);

  function updateItem(key: string, value: Partial<DraftItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...value } : item)));
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  function updateInstallmentsCount(value: string) {
    const count = Math.max(1, Math.min(24, Number(value) || 1));
    setInstallmentsCount(String(count));
    setInstallmentDueDates((current) => {
      const first = current[0] || todayDateInput();
      return Array.from({ length: count }, (_, index) => current[index] || addMonthsInput(first, index));
    });
  }

  function updateInstallmentDueDate(index: number, value: string) {
    setInstallmentDueDates((current) => current.map((date, currentIndex) => (currentIndex === index ? value : date)));
  }

  async function handleCancelSale(sale: Sale) {
    if (cancellingSaleId !== null || (sale.status ?? "CONCLUIDA") === "CANCELADA") return;
    const confirmed = window.confirm(`Cancelar a venda #${sale.id}? O estoque dos produtos vendidos sera devolvido e as faturas serao canceladas.`);
    if (!confirmed) return;
    const reason = window.prompt("Motivo do cancelamento (opcional)", "Lancamento incorreto");
    setCancellingSaleId(sale.id);
    setMessage(null);
    try {
      await apiFetch<Sale>(`/sales/${sale.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: reason || null })
      });
      setMessage({ text: `Venda #${sale.id} cancelada. Estoque e faturas atualizados.`, type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao cancelar venda."), type: "error" });
    } finally {
      setCancellingSaleId(null);
    }
  }

  function openAdjustmentModal(sale: Sale) {
    const count = sale.payment_method === "PRAZO" ? sale.installments_count : 1;
    const existingDates = sale.installments?.map((installment) => installment.due_date) ?? [];
    const firstDate = existingDates[0] || todayDateInput();
    setAdjustmentDraft({
      sale,
      paymentMethod: sale.payment_method,
      installmentsCount: String(count),
      installmentPaymentMethod: sale.installment_payment_method || "PIX",
      installmentDueDates: Array.from({ length: count }, (_, index) => existingDates[index] || addMonthsInput(firstDate, index)),
    });
  }

  function updateAdjustmentCount(value: string) {
    if (!adjustmentDraft) return;
    const count = Math.max(1, Math.min(24, Number(value) || 1));
    const firstDate = adjustmentDraft.installmentDueDates[0] || todayDateInput();
    setAdjustmentDraft({
      ...adjustmentDraft,
      installmentsCount: String(count),
      installmentDueDates: Array.from({ length: count }, (_, index) => adjustmentDraft.installmentDueDates[index] || addMonthsInput(firstDate, index)),
    });
  }

  async function handleAdjustmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustmentDraft || cancellingSaleId !== null) return;
    const body = {
      payment_method: adjustmentDraft.paymentMethod,
      installments_count: adjustmentDraft.paymentMethod === "PRAZO" ? Number(adjustmentDraft.installmentsCount) : 1,
      installment_payment_method: adjustmentDraft.paymentMethod === "PRAZO" ? adjustmentDraft.installmentPaymentMethod : null,
      installment_due_dates: adjustmentDraft.paymentMethod === "PRAZO" ? adjustmentDraft.installmentDueDates : null,
    };

    setCancellingSaleId(adjustmentDraft.sale.id);
    setMessage(null);
    try {
      await apiFetch<Sale>(`/sales/${adjustmentDraft.sale.id}/terms`, { method: "PATCH", body: JSON.stringify(body) });
      setMessage({ text: `Venda #${adjustmentDraft.sale.id} corrigida. As parcelas foram atualizadas.`, type: "success" });
      setAdjustmentDraft(null);
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao corrigir venda."), type: "error" });
    } finally {
      setCancellingSaleId(null);
    }
  }

  async function handleSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch<Sale>("/sales", {
        method: "POST",
        body: JSON.stringify({
          student_id: Number(studentId),
          payment_method: paymentMethod,
          installments_count: paymentMethod === "PRAZO" ? Number(installmentsCount) : 1,
          installment_payment_method: paymentMethod === "PRAZO" ? installmentPaymentMethod : null,
          first_due_date: paymentMethod === "PRAZO" ? installmentDueDates[0] : null,
          installment_due_dates: paymentMethod === "PRAZO" ? installmentDueDates : null,
          notes: notes || null,
          items: items.map((item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) }))
        })
      });
      setItems([makeItem()]);
      setStudentId("");
      setPaymentMethod("PIX");
      setInstallmentsCount("1");
      setInstallmentPaymentMethod("PIX");
      setInstallmentDueDates([todayDateInput()]);
      setNotes("");
      setMessage({ text: "Venda registrada e estoque atualizado.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao registrar venda."), type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReceiveInstallment(installment: NonNullable<Sale["installments"]>[number]) {
    if (receivingInstallmentId !== null) return;
    const balance = Number(installment.balance_due ?? installment.amount);
    const amountText = window.prompt("Valor recebido agora", balance.toFixed(2));
    if (amountText === null) return;
    const amount = Number(amountText.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      setMessage({ text: `Informe um valor entre R$ 0,01 e R$ ${balance.toFixed(2)}.`, type: "error" });
      return;
    }
    const methodText = window.prompt("Forma de pagamento: PIX, DINHEIRO, CARTAO ou OUTRO", installment.payment_method || "PIX");
    if (methodText === null) return;
    const paymentMethod = methodText.toUpperCase();
    if (!installmentMethods.includes(paymentMethod as PaymentMethod)) {
      setMessage({ text: "Forma de pagamento invalida.", type: "error" });
      return;
    }
    setReceivingInstallmentId(installment.id);
    try {
      await apiFetch(`/sales/installments/${installment.id}/receipts`, {
        method: "POST",
        body: JSON.stringify({ amount, payment_method: paymentMethod, paid_at: todayDateInput() })
      });
      setMessage({ text: amount < balance ? "Recebimento parcial registrado." : "Parcela quitada.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao registrar recebimento."), type: "error" });
    } finally {
      setReceivingInstallmentId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Vendas" subtitle="Venda de suplementos com baixa automatica." />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="panel flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand"><ShoppingCart className="h-5 w-5" aria-hidden /></div>
          <div><p className="text-xs font-medium text-ink/55">Vendas do dia</p><p className="mt-0.5 text-xl font-bold text-ink">{formatMoney(todayTotal)}</p></div>
        </div>
        <div className="panel flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand"><Receipt className="h-5 w-5" aria-hidden /></div>
          <div><p className="text-xs font-medium text-ink/55">Quantidade de vendas</p><p className="mt-0.5 text-xl font-bold text-ink">{todaySales.length}</p></div>
        </div>
        <div className="panel flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand"><CalendarDays className="h-5 w-5" aria-hidden /></div>
          <div><p className="text-xs font-medium text-ink/55">Ticket médio</p><p className="mt-0.5 text-xl font-bold text-ink">{formatMoney(averageTicket)}</p></div>
        </div>
      </div>

      {message ? <Message message={message.text} type={message.type} /> : null}

      <section>
        <form onSubmit={handleSale} className="panel space-y-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="panel-title">Nova venda</h2>
            <button
              className="btn-secondary w-full sm:w-auto"
              type="button"
              onClick={() => setItems((current) => [...current, makeItem()])}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Item
            </button>
          </div>

          <div>
            <label className="label" htmlFor="sale-student">Aluno</label>
            <select
              id="sale-student"
              className="field"
              required
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              <option value="">Selecione o aluno</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.phone}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {items.map((item) => {
              const product = products.find((current) => current.id === Number(item.product_id));
              const quantity = Number(item.quantity || 0);
              return (
                <div key={item.key} className="grid gap-3 rounded-lg border border-line p-3.5 md:grid-cols-[1fr_120px_120px_44px] md:items-end">
                  <div>
                    <label className="label" htmlFor={`sale-product-${item.key}`}>Produto</label>
                    <select
                      id={`sale-product-${item.key}`}
                      className="field"
                      required
                      value={item.product_id}
                      onChange={(e) => updateItem(item.key, { product_id: e.target.value })}
                    >
                      <option value="">Selecione um produto</option>
                      {products.map((productOption) => (
                        <option key={productOption.id} value={productOption.id}>
                          {productOption.name} ({productOption.stock_quantity} un.)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`sale-quantity-${item.key}`}>Quantidade</label>
                    <input
                      id={`sale-quantity-${item.key}`}
                      className="field"
                      required
                      type="number"
                      min="1"
                      max={product?.stock_quantity ?? undefined}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="flex h-[42px] items-center justify-end rounded-lg bg-paper px-3 text-sm font-bold text-ink">
                    {formatMoney(product ? Number(product.sale_price) * quantity : 0)}
                  </div>
                  <button
                    className="btn-secondary h-[42px] px-3"
                    type="button"
                    aria-label="Remover item"
                    title="Remover item"
                    onClick={() => removeItem(item.key)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="md:hidden">Remover</span>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-[200px_1fr_180px] md:items-end">
            <div>
              <label className="label" htmlFor="sale-payment-method">Forma de pagamento</label>
              <select
                id="sale-payment-method"
                className="field"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as SalePaymentMethod)}
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="sale-notes">Observacao</label>
              <input
                id="sale-notes"
                className="field"
                placeholder="Opcional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div>
              <p className="label">Total</p>
              <div className="rounded-lg border border-line bg-paper px-3 py-2.5 text-right text-lg font-bold text-ink">
                {formatMoney(total)}
              </div>
            </div>
          </div>

          {paymentMethod === "PRAZO" ? (
            <div className="space-y-3 rounded-lg border border-line bg-paper/70 p-3.5">
              <div className="grid gap-3 md:grid-cols-[140px_220px_1fr] md:items-end">
                <div>
                <label className="label" htmlFor="sale-installments">Parcelas</label>
                <input
                  id="sale-installments"
                  className="field"
                  required
                  type="number"
                  min="1"
                  max="24"
                  value={installmentsCount}
                  onChange={(event) => updateInstallmentsCount(event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="sale-installment-method">Forma combinada</label>
                <select
                  id="sale-installment-method"
                  className="field"
                  value={installmentPaymentMethod}
                  onChange={(event) => setInstallmentPaymentMethod(event.target.value as PaymentMethod)}
                >
                  {installmentMethods.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
              <p className="text-sm leading-6 text-ink/60">
                Defina o vencimento de cada fatura que ficara no historico do aluno.
              </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {installmentDueDates.map((dueDate, index) => (
                  <div key={`installment-due-${index}`}>
                    <label className="label" htmlFor={`sale-installment-due-${index}`}>Parcela {index + 1}</label>
                    <input
                      id={`sale-installment-due-${index}`}
                      className="field"
                      required
                      type="date"
                      value={dueDate}
                      onChange={(event) => updateInstallmentDueDate(index, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button className="btn-primary w-full" type="submit" disabled={submitting}>
            <ShoppingCart className="h-4 w-4" aria-hidden />
            {submitting ? "Registrando..." : "Finalizar venda"}
          </button>
        </form>

      </section>

      <section className="panel p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-brand" aria-hidden />
              <h2 className="panel-title">Histórico de vendas</h2>
            </div>
            <p className="mt-1 text-sm text-ink/55">Consulte, corrija ou cancele lançamentos com rapidez.</p>
          </div>
          <button className="btn-secondary" type="button" disabled title="Exportação será adicionada aos relatórios">
            Exportar
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_160px_160px_auto]">
          <label className="relative block">
            <span className="sr-only">Buscar venda ou aluno</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/45" aria-hidden />
            <input className="field pl-9" value={saleSearch} onChange={(event) => { setSaleSearch(event.target.value); setSalePage(1); }} placeholder="Buscar por nº da venda ou aluno..." />
          </label>
          <label>
            <span className="sr-only">Período</span>
            <select className="field" value={salePeriod} onChange={(event) => { setSalePeriod(event.target.value); setSalePage(1); }}>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="todos">Todo o período</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Status</span>
            <select className="field" value={saleStatus} onChange={(event) => { setSaleStatus(event.target.value); setSalePage(1); }}>
              <option value="TODOS">Status: Todos</option>
              <option value="CONCLUIDA">Concluídas</option>
              <option value="CANCELADA">Canceladas</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Pagamento</span>
            <select className="field" value={salePayment} onChange={(event) => { setSalePayment(event.target.value); setSalePage(1); }}>
              <option value="TODOS">Pagamento: Todos</option>
              {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
          <button className="btn-secondary whitespace-nowrap" type="button" onClick={() => { setSaleSearch(""); setSalePeriod("7"); setSaleStatus("TODOS"); setSalePayment("TODOS"); setSalePage(1); }}>
            Limpar filtros
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-paper text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Venda</th>
                <th className="px-4 py-3">Data e hora</th>
                <th className="px-4 py-3">Aluno</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {loading ? (
                <tr><td className="px-4 py-8" colSpan={7}><SkeletonRows rows={3} /></td></tr>
              ) : visibleSales.length === 0 ? (
                <tr><td className="px-4 py-10" colSpan={7}><EmptyState icon={Receipt} title="Nenhuma venda encontrada" hint="Ajuste os filtros ou registre uma nova venda." /></td></tr>
              ) : visibleSales.map((sale) => (
                <tr key={sale.id} className="transition-colors hover:bg-paper/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">#{sale.id}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">{formatDate(sale.created_at)} <span className="text-xs text-ink/45">{new Date(sale.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></td>
                  <td className="max-w-[240px] truncate px-4 py-3 font-medium text-ink">{sale.student?.name || "Venda avulsa"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">{salePaymentLabel(sale)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-ink">{formatMoney(sale.total_amount)}</td>
                  <td className="px-4 py-3"><StatusBadge value={sale.status ?? "CONCLUIDA"} /></td>
                  <td className="relative px-4 py-3 text-right">
                    <button className="btn-secondary h-9 w-9 px-0" type="button" aria-label={`Ações da venda ${sale.id}`} title="Ações" onClick={() => setOpenActionSaleId((current) => current === sale.id ? null : sale.id)}>
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                    {openActionSaleId === sale.id ? (
                      <div className="absolute right-4 top-12 z-20 w-48 rounded-lg border border-line bg-white p-1.5 text-left shadow-lift">
                        <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-paper" type="button" onClick={() => { setDetailSale(sale); setOpenActionSaleId(null); }}><Eye className="h-4 w-4" aria-hidden /> Visualizar detalhes</button>
                        {canManageSales && (sale.status ?? "CONCLUIDA") !== "CANCELADA" ? <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-paper" type="button" onClick={() => { openAdjustmentModal(sale); setOpenActionSaleId(null); }}><Receipt className="h-4 w-4" aria-hidden /> Corrigir pagamento</button> : null}
                        {canManageSales && (sale.status ?? "CONCLUIDA") !== "CANCELADA" ? <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger hover:bg-danger-soft" type="button" onClick={() => { setOpenActionSaleId(null); handleCancelSale(sale); }}><XCircle className="h-4 w-4" aria-hidden /> Cancelar venda</button> : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-col gap-3 text-sm text-ink/60 sm:flex-row sm:items-center sm:justify-between">
          <span>Mostrando {filteredSales.length ? (salePage - 1) * salesPerPage + 1 : 0}–{Math.min(salePage * salesPerPage, filteredSales.length)} de {filteredSales.length} vendas</span>
          <div className="flex items-center gap-1">
            <button className="btn-secondary h-9 w-9 px-0" type="button" disabled={salePage === 1} onClick={() => setSalePage((page) => page - 1)} aria-label="Página anterior">‹</button>
            <span className="px-3 font-semibold text-ink">{salePage} / {salesPageCount}</span>
            <button className="btn-secondary h-9 w-9 px-0" type="button" disabled={salePage >= salesPageCount} onClick={() => setSalePage((page) => page + 1)} aria-label="Próxima página">›</button>
          </div>
        </div>
      </section>

      {detailSale && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="presentation">
          <div className="relative z-10 max-h-[92vh] w-full overflow-y-auto border border-line bg-white text-ink shadow-2xl sm:max-w-xl sm:rounded-xl" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 id="sale-detail-title" className="text-lg font-bold">Detalhes da venda #{detailSale.id}</h2>
                <p className="mt-1 text-sm text-ink/55">{formatDate(detailSale.created_at)} · {new Date(detailSale.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <button className="btn-secondary h-10 w-10 px-0" type="button" aria-label="Fechar" title="Fechar" onClick={() => setDetailSale(null)}><X className="h-4 w-4" aria-hidden /></button>
            </div>
            <div className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><p className="label">Aluno</p><p className="font-semibold">{detailSale.student?.name || "Venda avulsa"}</p></div>
                <div><p className="field-label">Status</p><StatusBadge value={detailSale.status ?? "CONCLUIDA"} /></div>
                <div><p className="label">Pagamento</p><p className="font-semibold">{salePaymentLabel(detailSale)}</p></div>
                <div><p className="field-label">Total</p><p className="font-semibold text-brand">{formatMoney(detailSale.total_amount)}</p></div>
              </div>
              <div>
                <h3 className="text-sm font-bold">Produtos vendidos</h3>
                <div className="mt-2 divide-y divide-line rounded-lg border border-line">
                  {detailSale.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm"><span>{item.product?.name || `Produto #${item.product_id}`} <span className="text-ink/55">x{item.quantity}</span></span><span className="font-semibold">{formatMoney(item.subtotal)}</span></div>)}
                </div>
              </div>
              {detailSale.installments?.length ? <div><h3 className="text-sm font-bold">Parcelas</h3><div className="mt-2 space-y-2">{detailSale.installments.map((installment) => <div key={installment.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"><span>Parcela {installment.installment_number}/{detailSale.installments_count} · vence {formatDate(installment.due_date)}</span><span className="font-semibold">Saldo {formatMoney(installment.balance_due ?? installment.amount)}</span></div>)}</div></div> : null}
              {detailSale.notes ? <div><p className="label">Observações</p><p className="text-sm text-ink/70">{detailSale.notes}</p></div> : null}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {adjustmentDraft && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="presentation">
          <div
            className="relative z-10 max-h-[92vh] w-full overflow-y-auto border border-line bg-white text-ink shadow-2xl sm:max-w-lg sm:rounded-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-adjustment-title"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 id="sale-adjustment-title" className="text-lg font-bold text-ink">Corrigir venda #{adjustmentDraft.sale.id}</h2>
                <p className="mt-1 text-sm text-ink/60">Atualize a forma de pagamento e as parcelas.</p>
              </div>
              <button className="btn-secondary h-10 w-10 px-0" type="button" aria-label="Fechar" title="Fechar" onClick={() => setAdjustmentDraft(null)}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <form className="space-y-4 p-5" onSubmit={handleAdjustmentSubmit}>
              <div>
                <label className="label" htmlFor="adjustment-payment-method">Forma de pagamento</label>
                <select
                  id="adjustment-payment-method"
                  className="field"
                  value={adjustmentDraft.paymentMethod}
                  onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, paymentMethod: event.target.value as SalePaymentMethod })}
                >
                  {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>

              {adjustmentDraft.paymentMethod === "PRAZO" ? (
                <div className="space-y-4 rounded-lg border border-line bg-paper/70 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="adjustment-installments">Parcelas</label>
                      <input
                        id="adjustment-installments"
                        className="field"
                        type="number"
                        min="1"
                        max="24"
                        required
                        value={adjustmentDraft.installmentsCount}
                        onChange={(event) => updateAdjustmentCount(event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="adjustment-installment-method">Forma das parcelas</label>
                      <select
                        id="adjustment-installment-method"
                        className="field"
                        value={adjustmentDraft.installmentPaymentMethod}
                        onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, installmentPaymentMethod: event.target.value as PaymentMethod })}
                      >
                        {installmentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {adjustmentDraft.installmentDueDates.map((dueDate, index) => (
                      <div key={`adjustment-due-${index}`}>
                        <label className="label" htmlFor={`adjustment-due-${index}`}>Vencimento {index + 1}</label>
                        <input
                          id={`adjustment-due-${index}`}
                          className="field"
                          type="date"
                          required
                          value={dueDate}
                          onChange={(event) => setAdjustmentDraft({
                            ...adjustmentDraft,
                            installmentDueDates: adjustmentDraft.installmentDueDates.map((current, currentIndex) => currentIndex === index ? event.target.value : current),
                          })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button className="btn-secondary w-full sm:w-auto" type="button" onClick={() => setAdjustmentDraft(null)}>Cancelar</button>
                <button className="btn-primary w-full sm:w-auto" type="submit" disabled={cancellingSaleId === adjustmentDraft.sale.id}>
                  {cancellingSaleId === adjustmentDraft.sale.id ? "Salvando..." : "Salvar correção"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
