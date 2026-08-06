"use client";

import { Plus, Receipt, ShoppingCart, Trash2, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const canCancelSales = getSession()?.user.role === "ADMIN";

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
    setSales(salesData.slice(0, 10));
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

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Vendas" subtitle="Venda de suplementos com baixa automatica." />

      {message ? <Message message={message.text} type={message.type} /> : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
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

        <aside className="panel p-5">
          <h2 className="panel-title">Vendas recentes</h2>
          <div className="mt-4 space-y-2">
            {loading ? (
              <SkeletonRows rows={4} />
            ) : sales.length === 0 ? (
              <EmptyState icon={Receipt} title="Nenhuma venda registrada" hint="As vendas mais recentes aparecem aqui." />
            ) : (
              sales.map((sale) => (
                <div key={sale.id} className="rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">Venda #{sale.id}</p>
                      <StatusBadge value={sale.status ?? "CONCLUIDA"} />
                    </div>
                    <p className="text-sm font-bold text-brand">{formatMoney(sale.total_amount)}</p>
                  </div>
                  <p className="text-xs text-ink/55">
                    {sale.student?.name || "Aluno nao informado"} · {formatDate(sale.created_at)} · {salePaymentLabel(sale)}
                  </p>
                  {canCancelSales && (sale.status ?? "CONCLUIDA") !== "CANCELADA" ? (
                    <button
                      className="btn-secondary mt-3 w-full justify-center text-danger"
                      type="button"
                      disabled={cancellingSaleId === sale.id}
                      onClick={() => handleCancelSale(sale)}
                    >
                      <XCircle className="h-4 w-4" aria-hidden />
                      {cancellingSaleId === sale.id ? "Cancelando..." : "Cancelar venda"}
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
