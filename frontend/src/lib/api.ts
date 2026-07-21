import type { User } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROFILE_KEY = "ac_academia_profile";

// Em deploys com frontend e backend em domínios diferentes, o cookie pode falhar por
// políticas de third-party cookies do navegador. Para o MVP, persistimos o bearer token
// junto com o perfil e o reenviamos no header Authorization.
export interface StoredSession {
  user: User;
  accessToken: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function formatMoney(value: string | number): string {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numberValue || 0);
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(new Date(value));
}

export function getSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    window.localStorage.removeItem(PROFILE_KEY);
    return null;
  }
}

export function saveProfile(user: User): void {
  const current = getSession();
  if (!current) return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ user, accessToken: current.accessToken }));
}

export function saveSession(user: User, accessToken: string): void {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ user, accessToken }));
}

export function clearSession(): void {
  window.localStorage.removeItem(PROFILE_KEY);
}

// Sessão expirada/invalidada: limpa o perfil local e volta ao login (uma única vez).
function handleUnauthorized(): void {
  clearSession();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const hadSession = session !== null;
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include", // envia o cookie httpOnly de autenticação
    cache: "no-store"
  });

  if (!response.ok) {
    // 401 quando havia sessão = cookie expirado/revogado -> desloga. No login em si
    // (sem sessão) um 401 apenas significa credenciais inválidas.
    if (response.status === 401 && hadSession) {
      handleUnauthorized();
    }
    let message = "Nao foi possivel concluir a operacao.";
    try {
      const body = (await response.json()) as { detail?: string | Array<{ msg: string }> };
      if (typeof body.detail === "string") message = body.detail;
      if (Array.isArray(body.detail) && body.detail[0]?.msg) message = body.detail[0].msg;
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    // Mesmo se a chamada falhar, limpamos o estado local.
  }
  clearSession();
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const session = getSession();
  const hadSession = session !== null;
  const headers = new Headers();
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  const response = await fetch(`${API_URL}${path}`, { headers, credentials: "include", cache: "no-store" });
  if (!response.ok) {
    if (response.status === 401 && hadSession) {
      handleUnauthorized();
    }
    throw new ApiError(response.statusText || "Nao foi possivel baixar o arquivo.", response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoga com atraso: alguns navegadores cancelam o download se revogado imediatamente.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
