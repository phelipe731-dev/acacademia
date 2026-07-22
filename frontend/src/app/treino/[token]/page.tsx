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
      <main className="min-h-screen bg-[#f5f7f5] px-4 py-8 text-[#202522]">
        <div className="mx-auto max-w-md border border-[#e3e7e3] bg-white p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center text-danger">
            <AlertCircle className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <h1 className="mt-3 text-xl font-bold">Ficha indisponivel</h1>
          <p className="mt-2 text-sm leading-6 text-[#69716b]">
            Este link de treino esta invalido, expirado ou foi revogado.
          </p>
        </div>
      </main>
    );
  }

  return <PublicTrainingPlanClient plan={plan} token={token} />;
}
