import { AuthenticatedLayout } from "@/components/AuthenticatedLayout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
