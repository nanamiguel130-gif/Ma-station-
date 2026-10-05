-- ============================================================================
-- Ma-Station: Schéma SQL Complet pour Dashboard Gérant + Système de Test
-- ============================================================================

-- ============================================================================
-- 1. TABLE: PROFILES (Rôles et identité utilisateur)
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  photo_url text,
  platform_role text not null default 'owner' check (
    platform_role in (
      'owner',
      'manager',
      'chef_piste',
      'chef_boutique',
      'chef_baie',
      'hse',
      'pompiste',
      'hotesse',
      'technicien'
    )
  ),
  station_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- ============================================================================
-- 2. TABLE: USER_TEST_CONTEXT (Mode de test sans modifier le compte réel)
-- ============================================================================

create table if not exists public.user_test_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_test_mode boolean default false,
  effective_role text check (
    effective_role in (
      'owner',
      'manager',
      'chef_piste',
      'chef_boutique',
      'chef_baie',
      'hse',
      'pompiste',
      'hotesse',
      'technicien'
    )
  ),
  test_session_started_at timestamptz,
  updated_at timestamptz default now()
);

alter table public.user_test_context enable row level security;

-- ============================================================================
-- 3. TABLE: STATIONS (Stations-services)
-- ============================================================================

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text,
  city text,
  phone text,
  email text,
  logo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.stations enable row level security;

-- ============================================================================
-- 4. TABLE: STATION_STAFF (Personnel de la station)
-- ============================================================================

create table if not exists public.station_staff (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role text not null check (
    role in (
      'manager',
      'chef_piste',
      'chef_boutique',
      'chef_baie',
      'hse',
      'pompiste',
      'hotesse',
      'technicien'
    )
  ),
  status text not null default 'active' check (status in ('active', 'inactive', 'on_leave')),
  photo_url text,
  hire_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.station_staff enable row level security;

-- ============================================================================
-- 5. TABLE: ATTENDANCE (Présence du personnel)
-- ============================================================================

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.station_staff(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  attendance_date date not null,
  check_in_time time,
  check_out_time time,
  status text not null check (status in ('present', 'absent', 'late', 'half_day', 'leave')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(staff_id, attendance_date)
);

alter table public.attendance enable row level security;

-- ============================================================================
-- 6. TABLE: FUEL_TANKS (Cuves de carburant)
-- ============================================================================

create table if not exists public.fuel_tanks (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  tank_number text not null,
  product_type text not null check (
    product_type in ('essence', 'diesel', 'premium', 'super_diesel')
  ),
  capacity_liters numeric not null,
  current_level_liters numeric not null default 0,
  alert_threshold_percent numeric not null default 20,
  last_delivery_date date,
  next_delivery_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(station_id, tank_number)
);

alter table public.fuel_tanks enable row level security;

-- ============================================================================
-- 7. TABLE: FUEL_SALES (Ventes de carburant)
-- ============================================================================

create table if not exists public.fuel_sales (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  tank_id uuid not null references public.fuel_tanks(id) on delete cascade,
  pump_id text,
  attendant_id uuid references public.station_staff(id) on delete set null,
  quantity_liters numeric not null,
  unit_price numeric not null,
  total_amount numeric not null,
  payment_method text check (
    payment_method in ('cash', 'card', 'orange_money', 'mtn_mobile', 'tom_card', 'voucher', 'credit')
  ),
  sale_date date not null,
  sale_time time not null,
  created_at timestamptz default now()
);

alter table public.fuel_sales enable row level security;

-- ============================================================================
-- 8. TABLE: SHOP_PRODUCTS (Produits de la boutique)
-- ============================================================================

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  name text not null,
  description text,
  category text check (
    category in ('beverages', 'snacks', 'hygiene', 'accessories', 'other')
  ),
  sku text,
  purchase_price numeric,
  selling_price numeric not null,
  current_stock numeric not null default 0,
  alert_stock_threshold numeric default 10,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.shop_products enable row level security;

-- ============================================================================
-- 9. TABLE: SHOP_SALES (Ventes boutique)
-- ============================================================================

create table if not exists public.shop_sales (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  product_id uuid not null references public.shop_products(id) on delete cascade,
  quantity numeric not null,
  unit_price numeric not null,
  total_amount numeric not null,
  payment_method text check (
    payment_method in ('cash', 'card', 'orange_money', 'mtn_mobile', 'tom_card', 'voucher', 'credit')
  ),
  sale_date date not null,
  sale_time time not null,
  cashier_id uuid references public.station_staff(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.shop_sales enable row level security;

-- ============================================================================
-- 10. TABLE: BAY_SERVICES (Services de la baie – Vidanges, graissages, filtres)
-- ============================================================================

create table if not exists public.bay_services (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  service_type text not null check (
    service_type in ('oil_change', 'greasing', 'filter_change', 'tire_repair', 'washing', 'inspection', 'other')
  ),
  description text,
  base_price numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.bay_services enable row level security;

-- ============================================================================
-- 11. TABLE: BAY_JOBS (Travaux réalisés à la baie)
-- ============================================================================

create table if not exists public.bay_jobs (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  service_id uuid not null references public.bay_services(id) on delete cascade,
  technician_id uuid references public.station_staff(id) on delete set null,
  vehicle_plate text,
  customer_name text,
  customer_phone text,
  service_price numeric not null,
  parts_cost numeric default 0,
  total_amount numeric not null,
  payment_method text check (
    payment_method in ('cash', 'card', 'orange_money', 'mtn_mobile', 'tom_card', 'voucher', 'credit')
  ),
  status text not null default 'in_progress' check (
    status in ('in_progress', 'completed', 'cancelled', 'pending')
  ),
  job_date date not null,
  job_start_time time,
  job_end_time time,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.bay_jobs enable row level security;

-- ============================================================================
-- 12. TABLE: FINANCIAL_TRANSACTIONS (Transactions financières)
-- ============================================================================

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  transaction_date date not null,
  transaction_time time not null,
  transaction_type text not null check (
    transaction_type in (
      'fuel_sale',
      'shop_sale',
      'bay_service',
      'cash_deposit',
      'expense',
      'refund',
      'credit_payment'
    )
  ),
  payment_method text not null check (
    payment_method in ('cash', 'card', 'orange_money', 'mtn_mobile', 'tom_card', 'voucher', 'credit')
  ),
  amount numeric not null,
  reference_id uuid,
  recorded_by uuid references public.station_staff(id) on delete set null,
  notes text,
  created_at timestamptz default now()
);

alter table public.financial_transactions enable row level security;

-- ============================================================================
-- 13. TABLE: DAILY_RECONCILIATION (Rapprochement journalier caisse)
-- ============================================================================

create table if not exists public.daily_reconciliation (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  reconciliation_date date not null unique,
  cash_opening numeric,
  total_fuel_sales numeric,
  total_shop_sales numeric,
  total_bay_services numeric,
  total_cash_collected numeric,
  total_card_collected numeric,
  total_orange_money numeric,
  total_mtn_mobile numeric,
  total_tom_card numeric,
  total_vouchers numeric,
  total_credits numeric,
  total_expected numeric,
  cash_count numeric,
  cash_variance numeric,
  reconciled_by uuid references public.station_staff(id) on delete set null,
  reconciliation_time time,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.daily_reconciliation enable row level security;

-- ============================================================================
-- 14. TABLE: ALERTS (Alertes prioritaires)
-- ============================================================================

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  alert_type text not null check (
    alert_type in (
      'low_tank',
      'late_payment',
      'cash_variance',
      'low_shop_stock',
      'equipment_maintenance',
      'document_expiry',
      'hse_incident',
      'fuel_delivery_scheduled',
      'staff_absence',
      'system_alert'
    )
  ),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  description text,
  related_id uuid,
  is_resolved boolean default false,
  resolved_at timestamptz,
  resolved_by uuid references public.station_staff(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.alerts enable row level security;

-- ============================================================================
-- 15. TABLE: TASKS (Tâches et réunions)
-- ============================================================================

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  title text not null,
  description text,
  task_type text not null check (task_type in ('task', 'meeting', 'reminder')),
  assigned_to uuid references public.station_staff(id) on delete set null,
  created_by uuid references public.station_staff(id) on delete set null,
  status text not null default 'pending' check (
    status in ('pending', 'in_progress', 'completed', 'cancelled')
  ),
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  due_time time,
  completed_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tasks enable row level security;

-- ============================================================================
-- 16. TABLE: PUMP_STATUS (État des pompes)
-- ============================================================================

create table if not exists public.pump_status (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  pump_number text not null,
  tank_id uuid references public.fuel_tanks(id) on delete set null,
  is_active boolean default true,
  current_attendant_id uuid references public.station_staff(id) on delete set null,
  meter_reading_start numeric,
  meter_reading_end numeric,
  shift_date date not null,
  shift_start_time time,
  shift_end_time time,
  total_sales_amount numeric,
  total_volume_liters numeric,
  status text not null default 'idle' check (
    status in ('idle', 'dispensing', 'maintenance', 'offline')
  ),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(station_id, pump_number, shift_date)
);

alter table public.pump_status enable row level security;

-- ============================================================================
-- 17. TABLE: PERFORMANCE_RANKINGS (Classements de performance)
-- ============================================================================

create table if not exists public.performance_rankings (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  staff_id uuid not null references public.station_staff(id) on delete cascade,
  ranking_type text not null check (
    ranking_type in ('pump_attendant', 'hostess', 'technician', 'overall')
  ),
  period text not null check (period in ('daily', 'weekly', 'monthly')),
  period_date date not null,
  rank integer,
  score numeric,
  sales_total numeric,
  customers_served integer,
  transactions_count integer,
  quality_rating numeric,
  notes text,
  created_at timestamptz default now(),
  unique(station_id, staff_id, ranking_type, period, period_date)
);

alter table public.performance_rankings enable row level security;

-- ============================================================================
-- 18. TABLE: HSE_INCIDENTS (Incidents Hygiène, Sécurité, Environnement)
-- ============================================================================

create table if not exists public.hse_incidents (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  incident_type text not null check (
    incident_type in (
      'accident',
      'near_miss',
      'hazard',
      'environmental',
      'safety_violation',
      'other'
    )
  ),
  severity text not null check (severity in ('minor', 'moderate', 'severe', 'critical')),
  description text not null,
  location text,
  reported_by uuid references public.station_staff(id) on delete set null,
  reported_date date not null,
  reported_time time,
  injured_party text,
  immediate_actions text,
  investigation_notes text,
  corrective_actions text,
  status text not null default 'open' check (
    status in ('open', 'investigating', 'resolved', 'closed')
  ),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.hse_incidents enable row level security;

-- ============================================================================
-- 19. TABLE: KPI_CACHE (Cache des KPI pour performances)
-- ============================================================================

create table if not exists public.kpi_cache (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  kpi_date date not null,
  daily_revenue numeric,
  daily_fuel_volume numeric,
  daily_customers_count integer,
  daily_payments_received numeric,
  previous_day_revenue numeric,
  previous_day_fuel_volume numeric,
  previous_day_customers_count integer,
  previous_day_payments_received numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(station_id, kpi_date)
);

alter table public.kpi_cache enable row level security;

-- ============================================================================
-- INDEXES (Optimisation des requêtes)
-- ============================================================================

create index idx_profiles_station_id on public.profiles(station_id);
create index idx_profiles_platform_role on public.profiles(platform_role);
create index idx_user_test_context_user_id on public.user_test_context(user_id);
create index idx_station_staff_station_id on public.station_staff(station_id);
create index idx_station_staff_role on public.station_staff(role);
create index idx_attendance_station_id on public.attendance(station_id);
create index idx_attendance_date on public.attendance(attendance_date);
create index idx_fuel_tanks_station_id on public.fuel_tanks(station_id);
create index idx_fuel_sales_station_id on public.fuel_sales(station_id);
create index idx_fuel_sales_date on public.fuel_sales(sale_date);
create index idx_shop_products_station_id on public.shop_products(station_id);
create index idx_shop_sales_station_id on public.shop_sales(station_id);
create index idx_shop_sales_date on public.shop_sales(sale_date);
create index idx_bay_jobs_station_id on public.bay_jobs(station_id);
create index idx_bay_jobs_date on public.bay_jobs(job_date);
create index idx_financial_transactions_station_id on public.financial_transactions(station_id);
create index idx_financial_transactions_date on public.financial_transactions(transaction_date);
create index idx_daily_reconciliation_station_id on public.daily_reconciliation(station_id);
create index idx_daily_reconciliation_date on public.daily_reconciliation(reconciliation_date);
create index idx_alerts_station_id on public.alerts(station_id);
create index idx_alerts_type on public.alerts(alert_type);
create index idx_alerts_resolved on public.alerts(is_resolved);
create index idx_tasks_station_id on public.tasks(station_id);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_due_date on public.tasks(due_date);
create index idx_pump_status_station_id on public.pump_status(station_id);
create index idx_performance_rankings_station_id on public.performance_rankings(station_id);
create index idx_performance_rankings_period_date on public.performance_rankings(period_date);
create index idx_hse_incidents_station_id on public.hse_incidents(station_id);
create index idx_hse_incidents_date on public.hse_incidents(reported_date);
create index idx_kpi_cache_station_id on public.kpi_cache(station_id);
create index idx_kpi_cache_date on public.kpi_cache(kpi_date);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Profiles: Les utilisateurs peuvent voir leur propre profil
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- User Test Context: Chaque utilisateur gère son propre contexte de test
create policy "Users can view own test context" on public.user_test_context
  for select using (auth.uid() = user_id);

create policy "Users can update own test context" on public.user_test_context
  for update using (auth.uid() = user_id);

-- Stations: Propriétaire accès total, gestionnaires accès limité
create policy "Owner can access all stations" on public.stations
  for select using (
    auth.uid() = owner_id or
    (select platform_role from public.profiles where id = auth.uid()) = 'owner'
  );

create policy "Managers and staff can access assigned station" on public.stations
  for select using (
    exists (
      select 1 from public.station_staff
      where station_id = stations.id
      and user_id = auth.uid()
    )
  );

-- Station Staff: Accès à la station assignée
create policy "Staff can view own data" on public.station_staff
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    ) or
    user_id = auth.uid()
  );

-- Attendance: Visibilité par rôle
create policy "Staff can view attendance" on public.attendance
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- Fuel Tanks: Lecture par rôle autorisé
create policy "Authorized roles can view fuel tanks" on public.fuel_tanks
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- Fuel Sales: Lecture par rôle autorisé
create policy "Authorized roles can view fuel sales" on public.fuel_sales
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- Shop Products: Lecture par rôle autorisé
create policy "Authorized roles can view shop products" on public.shop_products
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- Shop Sales: Lecture par rôle autorisé
create policy "Authorized roles can view shop sales" on public.shop_sales
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- Bay Services & Jobs: Lecture par rôle autorisé
create policy "Authorized roles can view bay jobs" on public.bay_jobs
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- Financial Transactions: Lecture restreinte (Manager, Owner)
create policy "Managers can view financial transactions" on public.financial_transactions
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  );

-- Daily Reconciliation: Lecture restreinte
create policy "Managers can view reconciliation" on public.daily_reconciliation
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  );

-- Alerts: Lecture par rôle autorisé
create policy "Staff can view alerts" on public.alerts
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- Tasks: Lecture par rôle autorisé
create policy "Staff can view tasks" on public.tasks
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- Pump Status: Lecture par rôle autorisé
create policy "Authorized roles can view pump status" on public.pump_status
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- Performance Rankings: Lecture par rôle autorisé
create policy "Authorized roles can view rankings" on public.performance_rankings
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- HSE Incidents: Lecture par HSE et Managers
create policy "HSE and managers can view incidents" on public.hse_incidents
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('hse', 'manager')
    )
  );

-- KPI Cache: Lecture par rôle autorisé
create policy "Authorized roles can view kpi cache" on public.kpi_cache
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

-- ============================================================================
-- FIN MIGRATION
-- ============================================================================
