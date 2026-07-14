export type UserRole = "ADMIN" | "RECEPCAO" | "PROFESSOR";
export type StudentStatus = "ATIVO" | "INATIVO" | "INADIMPLENTE";
export type PaymentStatus = "PENDENTE" | "PAGO" | "ATRASADO" | "CANCELADO";
export type PaymentMethod = "DINHEIRO" | "PIX" | "CARTAO" | "OUTRO";
export type ProductStatus = "ATIVO" | "INATIVO";
export type StockMovementType = "ENTRADA" | "SAIDA_VENDA" | "AJUSTE";
export type TrainingMediaType = "IMAGE" | "VIDEO" | "EXTERNAL_IMAGE" | "EXTERNAL_VIDEO";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Session {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Student {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  cpf?: string | null;
  birth_date?: string | null;
  plan: string;
  plan_end_date?: string | null;
  monthly_fee: string;
  due_day: number;
  status: StudentStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckIn {
  id: number;
  student_id: number;
  checked_in_at: string;
  created_by_id?: number | null;
  student?: Student | null;
}

export interface InactiveStudentRow {
  student_id: number;
  name: string;
  phone: string;
  last_checkin?: string | null;
  days_since?: number | null;
}

export interface ExpiringPlanRow {
  student_id: number;
  name: string;
  phone: string;
  plan: string;
  plan_end_date: string;
  days_left: number;
}

export interface BirthdayRow {
  student_id: number;
  name: string;
  phone: string;
  birth_date: string;
  day: number;
}

export interface Payment {
  id: number;
  student_id: number;
  amount: string;
  due_date: string;
  paid_at?: string | null;
  status: PaymentStatus;
  payment_method: PaymentMethod;
  notes?: string | null;
  created_by_id?: number | null;
  created_at: string;
  updated_at: string;
  student?: Student;
}

export interface Product {
  id: number;
  name: string;
  category?: string | null;
  cost_price?: string | null;
  sale_price: string;
  stock_quantity: number;
  min_stock: number;
  status: ProductStatus;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  type: StockMovementType;
  quantity: number;
  reason?: string | null;
  created_by_id?: number | null;
  created_at: string;
  product?: Product | null;
  created_by?: User | null;
}

export interface SaleItem {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: string;
  subtotal: string;
  product?: Product | null;
}

export interface Sale {
  id: number;
  payment_method: PaymentMethod;
  total_amount: string;
  notes?: string | null;
  created_by_id?: number | null;
  created_at: string;
  items: SaleItem[];
  created_by?: User | null;
}

export interface TopProduct {
  product_id: number;
  name: string;
  quantity: number;
  total: string;
}

export interface RevenuePoint {
  label: string;
  payments: string;
  sales: string;
  total: string;
}

export interface Dashboard {
  active_students: number;
  defaulter_students: number;
  payments_received_month: string;
  overdue_payments: number;
  sales_month: string;
  revenue_month: string;
  low_stock_products: Product[];
  top_products: TopProduct[];
  revenue_points: RevenuePoint[];
}

export interface DefaulterReportRow {
  student_id: number;
  student_name: string;
  phone: string;
  overdue_amount: string;
  oldest_due_date: string;
}

export interface PaymentReportRow {
  id: number;
  student_name: string;
  amount: string;
  paid_at?: string | null;
  due_date: string;
  payment_method: string;
}

export interface SaleReportRow {
  id: number;
  created_at: string;
  payment_method: string;
  total_amount: string;
  user_name?: string | null;
  items_count: number;
}

export interface RevenueReport {
  start_date: string;
  end_date: string;
  payments_total: string;
  sales_total: string;
  total: string;
}

export interface ImportErrorRow {
  row: number;
  message: string;
}

export interface StudentImportResult {
  imported: number;
  skipped: number;
  errors: ImportErrorRow[];
}

export interface MonthlyPaymentsGenerateResult {
  year: number;
  month: number;
  generated: number;
  skipped_existing: number;
  due_dates: string[];
}

export interface AuditLog {
  id: number;
  entity_type: string;
  entity_id?: number | null;
  action: string;
  summary: string;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  created_by_id?: number | null;
  created_at: string;
  created_by?: User | null;
}

export interface TrainingPlanExerciseMedia {
  id: number;
  training_plan_exercise_id: number;
  media_type: TrainingMediaType;
  file_url?: string | null;
  external_url?: string | null;
  thumbnail_url?: string | null;
  title?: string | null;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  created_by_user_id?: number | null;
}

export interface TrainingPlanExercise {
  id: number;
  training_plan_id: number;
  name: string;
  muscle_group?: string | null;
  sets?: string | null;
  repetitions?: string | null;
  load?: string | null;
  rest?: string | null;
  notes?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  media: TrainingPlanExerciseMedia[];
}

export interface TrainingPlan {
  id: number;
  student_id: number;
  name: string;
  objective?: string | null;
  start_date?: string | null;
  reassessment_date?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_by_id?: number | null;
  created_at: string;
  updated_at: string;
  student?: Student | null;
  exercises: TrainingPlanExercise[];
}

export interface TrainingPlanShareLink {
  id: number;
  training_plan_id: number;
  token: string;
  public_url: string;
  is_active: boolean;
  expires_at?: string | null;
  created_at: string;
  revoked_at?: string | null;
}

export interface PublicTrainingPlanMedia {
  media_type: TrainingMediaType;
  file_url?: string | null;
  external_url?: string | null;
  thumbnail_url?: string | null;
  title?: string | null;
  description?: string | null;
  sort_order: number;
}

export interface PublicTrainingPlanExercise {
  name: string;
  muscle_group?: string | null;
  sets?: string | null;
  repetitions?: string | null;
  load?: string | null;
  rest?: string | null;
  notes?: string | null;
  sort_order: number;
  media: PublicTrainingPlanMedia[];
}

export interface PublicTrainingPlan {
  academy_name: string;
  academy_logo_url?: string | null;
  student_name: string;
  plan_name: string;
  objective?: string | null;
  start_date?: string | null;
  reassessment_date?: string | null;
  notes?: string | null;
  exercises: PublicTrainingPlanExercise[];
}
