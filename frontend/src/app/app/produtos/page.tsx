"use client";

import { History, PackagePlus, PackageSearch, Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Message } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, MobileRecord, MobileRecordRow, PageHeader, SkeletonRows, getErrorMessage } from "@/components/ui";
import { apiFetch, formatMoney, getSession } from "@/lib/api";
import type { Product, ProductStatus, StockMovement, StockMovementType, UserRole } from "@/lib/types";

export default function ProductsPage() {
  const [role, setRole] = useState<UserRole>("RECEPCAO");
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    category: "",
    cost_price: "",
    sale_price: "",
    stock_quantity: "0",
    min_stock: "0",
    status: "ATIVO" as ProductStatus
  });
  const [stockForm, setStockForm] = useState({
    product_id: "",
    type: "ENTRADA" as StockMovementType,
    quantity: "1",
    reason: ""
  });

  async function load() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const [productsData, movementsData] = await Promise.all([
      apiFetch<Product[]>(`/products?${params.toString()}`),
      apiFetch<StockMovement[]>("/stock-movements")
    ]);
    setProducts(productsData);
    setMovements(movementsData.slice(0, 8));
  }

  useEffect(() => {
    setRole(getSession()?.user.role ?? "RECEPCAO");
    load()
      .catch((error) => setMessage({ text: getErrorMessage(error, "Erro ao carregar produtos."), type: "error" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() {
    load().catch((error) =>
      setMessage({ text: getErrorMessage(error, "Erro ao buscar produtos."), type: "error" })
    );
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingProduct) return;
    setCreatingProduct(true);
    try {
      await apiFetch<Product>("/products", {
        method: "POST",
        body: JSON.stringify({
          name: productForm.name,
          category: productForm.category || null,
          cost_price: productForm.cost_price ? Number(productForm.cost_price) : null,
          sale_price: Number(productForm.sale_price),
          stock_quantity: Number(productForm.stock_quantity),
          min_stock: Number(productForm.min_stock),
          status: productForm.status
        })
      });
      setProductForm({ name: "", category: "", cost_price: "", sale_price: "", stock_quantity: "0", min_stock: "0", status: "ATIVO" });
      setMessage({ text: "Produto cadastrado.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao cadastrar produto."), type: "error" });
    } finally {
      setCreatingProduct(false);
    }
  }

  async function handleStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingStock) return;
    setSavingStock(true);
    try {
      await apiFetch<StockMovement>("/stock-movements", {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(stockForm.product_id),
          type: stockForm.type,
          quantity: Number(stockForm.quantity),
          reason: stockForm.reason || null
        })
      });
      setStockForm({ product_id: "", type: "ENTRADA", quantity: "1", reason: "" });
      setMessage({ text: "Movimentacao registrada.", type: "success" });
      await load();
    } catch (error) {
      setMessage({ text: getErrorMessage(error, "Erro ao movimentar estoque."), type: "error" });
    } finally {
      setSavingStock(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Produtos e estoque" subtitle="Suplementos, saldo atual e movimentacoes." />

      {message ? <Message message={message.text} type={message.type} /> : null}

      {role === "ADMIN" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <form onSubmit={handleCreateProduct} className="panel grid gap-4 p-5 md:grid-cols-2">
            <h2 className="panel-title md:col-span-2">Novo produto</h2>
            <div className="md:col-span-2">
              <label className="label" htmlFor="product-name">Nome</label>
              <input
                id="product-name"
                className="field"
                required
                placeholder="Ex.: Whey 900g"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="product-category">Categoria</label>
              <input
                id="product-category"
                className="field"
                placeholder="Ex.: Suplementos"
                value={productForm.category}
                onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="product-status">Status</label>
              <select
                id="product-status"
                className="field"
                value={productForm.status}
                onChange={(e) => setProductForm({ ...productForm, status: e.target.value as ProductStatus })}
              >
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="product-cost-price">Preco de custo</label>
              <input
                id="product-cost-price"
                className="field"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={productForm.cost_price}
                onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="product-sale-price">Preco de venda</label>
              <input
                id="product-sale-price"
                className="field"
                required
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0,00"
                value={productForm.sale_price}
                onChange={(e) => setProductForm({ ...productForm, sale_price: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="product-stock">Estoque inicial</label>
              <input
                id="product-stock"
                className="field"
                type="number"
                min="0"
                value={productForm.stock_quantity}
                onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="product-min-stock">Estoque minimo</label>
              <input
                id="product-min-stock"
                className="field"
                type="number"
                min="0"
                value={productForm.min_stock}
                onChange={(e) => setProductForm({ ...productForm, min_stock: e.target.value })}
              />
            </div>
            <button className="btn-primary md:col-span-2" type="submit" disabled={creatingProduct}>
              <PackagePlus className="h-4 w-4" aria-hidden />
              {creatingProduct ? "Cadastrando..." : "Cadastrar produto"}
            </button>
          </form>

          <form onSubmit={handleStock} className="panel grid gap-4 p-5 md:grid-cols-2">
            <h2 className="panel-title md:col-span-2">Entrada ou ajuste</h2>
            <div className="md:col-span-2">
              <label className="label" htmlFor="stock-product">Produto</label>
              <select
                id="stock-product"
                className="field"
                required
                value={stockForm.product_id}
                onChange={(e) => setStockForm({ ...stockForm, product_id: e.target.value })}
              >
                <option value="">Selecione um produto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="stock-type">Tipo</label>
              <select
                id="stock-type"
                className="field"
                value={stockForm.type}
                onChange={(e) => setStockForm({ ...stockForm, type: e.target.value as StockMovementType })}
              >
                <option value="ENTRADA">Entrada</option>
                <option value="AJUSTE">Ajuste</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="stock-quantity">Quantidade</label>
              <input
                id="stock-quantity"
                className="field"
                required
                type="number"
                value={stockForm.quantity}
                onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="stock-reason">Motivo</label>
              <input
                id="stock-reason"
                className="field"
                placeholder="Ex.: Reposicao de fornecedor"
                value={stockForm.reason}
                onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })}
              />
            </div>
            <button className="btn-primary md:col-span-2" type="submit" disabled={savingStock}>
              {savingStock ? "Registrando..." : "Registrar movimentacao"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="panel p-5">
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className="label" htmlFor="product-search">Buscar</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/55" aria-hidden />
                <input
                  id="product-search"
                  className="field pl-9"
                  placeholder="Nome ou categoria"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <button className="btn-secondary w-full sm:w-auto" type="button" onClick={handleSearch}>Buscar</button>
          </div>
          {loading ? (
            <SkeletonRows rows={4} />
          ) : products.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Nenhum produto cadastrado"
              hint="Cadastre o primeiro produto para comecar a controlar o estoque."
            />
          ) : (
            <>
              <div className="mobile-card-list">
                {products.map((product) => (
                  <MobileRecord
                    key={product.id}
                    title={product.name}
                    subtitle={product.category || "Sem categoria"}
                    badge={<StatusBadge value={product.status} />}
                    className={product.is_low_stock ? "border-warning/30 bg-warning-soft/60" : ""}
                  >
                    <MobileRecordRow label="Venda" value={formatMoney(product.sale_price)} />
                    <MobileRecordRow
                      label="Estoque"
                      value={
                        <span className={product.is_low_stock ? "text-warning" : ""}>
                          {product.stock_quantity} un.
                        </span>
                      }
                    />
                    <MobileRecordRow label="Minimo" value={`${product.min_stock} un.`} />
                  </MobileRecord>
                ))}
              </div>

              <div className="desktop-table-wrap">
                <table className="table-base min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Categoria</th>
                      <th>Venda</th>
                      <th>Estoque</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} className={product.is_low_stock ? "bg-warning-soft/60" : ""}>
                        <td className="font-semibold text-ink">{product.name}</td>
                        <td>{product.category || "-"}</td>
                        <td>{formatMoney(product.sale_price)}</td>
                        <td>
                          <span className={product.is_low_stock ? "font-bold text-warning" : "font-semibold"}>
                            {product.stock_quantity}
                          </span>
                          <span className="text-xs text-ink/55"> / min {product.min_stock}</span>
                        </td>
                        <td><StatusBadge value={product.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <aside className="panel p-5">
          <h2 className="panel-title">Ultimas movimentacoes</h2>
          <div className="mt-4 space-y-2">
            {loading ? (
              <SkeletonRows rows={4} />
            ) : movements.length === 0 ? (
              <EmptyState icon={History} title="Sem movimentacoes registradas" />
            ) : (
              movements.map((movement) => (
                <div
                  key={movement.id}
                  className="rounded-lg border border-line px-3.5 py-3 transition hover:bg-paper/70"
                >
                  <p className="text-sm font-semibold text-ink">{movement.product?.name ?? movement.product_id}</p>
                  <p className="text-xs text-ink/55">{movement.type} · {movement.quantity} un.</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
