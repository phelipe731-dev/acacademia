import { AlertCircle } from "lucide-react";

import { PublicTrainingPlanClient } from "./PublicTrainingPlanClient";
import type { PublicTrainingPlan } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const dynamic = "force-dynamic";

async function fetchTrainingPlan(token: string): Promise<PublicTrainingPlan | null> {
  try {
    const response = await fetch(`${API_URL}/public/training-plans/${token}`, {
      cache: "no-store"
    });
    if (!response.ok) return null;
    return (await response.json()) as PublicTrainingPlan;
  } catch {
    return null;
  }
}

export default async function PublicTrainingPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const plan = await fetchTrainingPlan(token);

  if (!plan) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f7f4ed_0%,#f4f1ea_30%,#ece8df_100%)] px-4 py-8">
        <div className="mx-auto max-w-md rounded-[30px] border border-line bg-surface p-6 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertCircle className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-ink">Ficha indisponivel</h1>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            Este link de treino esta invalido, expirado ou foi revogado.
          </p>
        </div>
      </main>
    );
  }

  return <PublicTrainingPlanClient plan={plan} token={token} />;
}
