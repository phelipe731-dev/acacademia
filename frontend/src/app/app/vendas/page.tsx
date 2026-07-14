"use client";

import { Plus, Receipt, ShoppingCart, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Message } from "@/components/Message";
import { EmptyState, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatDate, formatMoney } from "@/lib/api";
import type { PaymentMethod, Product, Sale } from "@/lib/types";

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

const paymentMethods: PaymentMethod[] = ["DINHEIRO", "PIX", "CARTAO", "OUTRO"];

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<DraftItem[]>(() => [makeItem("initial")]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);

  async function load() {
    const [productsData, salesData] = await Promise.all([
      apiFetch<Product[]>("/products?available_for_sale=true"),
      apiFetch<Sale[]>("/sales")
    ]);
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

  async function handleSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch<Sale>("/sales", {
        method: "POST",
        body: JSON.stringify({
          payment_method: paymentMethod,
          notes: notes || null,
          items: items.map((item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) }))
        })
      });
      setItems([makeItem()]);
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
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
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
                    <p className="text-sm font-semibold text-ink">Venda #{sale.id}</p>
                    <p className="text-sm font-bold text-brand">{formatMoney(sale.total_amount)}</p>
                  </div>
                  <p className="text-xs text-ink/55">{formatDate(sale.created_at)} · {sale.payment_method}</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
