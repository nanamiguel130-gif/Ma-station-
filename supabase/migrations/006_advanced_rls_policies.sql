-- ============================================================================
-- 6. POLITIQUES RLS AVANCÉES
--    Sécurisation des données selon les rôles (avec support mode test)
-- ============================================================================

-- ============================================================================
-- Politique pour PROFILES (lisibilité restreinte)
-- ============================================================================

create policy "Owner can view all profiles in their station" on public.profiles
  for select using (
    exists (
      select 1 from public.station_staff ss
      join public.stations s on ss.station_id = s.id
      where s.owner_id = auth.uid()
      and ss.user_id = profiles.id
    )
    or auth.uid() = id
  );

-- ============================================================================
-- Politique pour USER_TEST_CONTEXT (privé)
-- ============================================================================

create policy "Users can only manage their own test context" on public.user_test_context
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- Politique pour STATIONS
-- ============================================================================

drop policy if exists "Owner can access all stations" on public.stations;
drop policy if exists "Managers and staff can access assigned station" on public.stations;

create policy "Owner full access to stations" on public.stations
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Staff can read their station" on public.stations
  for select using (
    exists (
      select 1 from public.station_staff
      where station_id = stations.id
      and user_id = auth.uid()
    )
  );

-- ============================================================================
-- Politique pour STATION_STAFF
-- ============================================================================

drop policy if exists "Staff can view own data" on public.station_staff;

create policy "Staff can read their own data" on public.station_staff
  for select using (
    auth.uid() = user_id
    or station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

create policy "Manager can update staff in their station" on public.station_staff
  for update using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  )
  with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  );

-- ============================================================================
-- Politique pour ATTENDANCE
-- ============================================================================

drop policy if exists "Staff can view attendance" on public.attendance;

create policy "Managers can view attendance" on public.attendance
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste', 'hse')
    )
  );

create policy "Staff can view own attendance" on public.attendance
  for select using (
    staff_id in (
      select id from public.station_staff where user_id = auth.uid()
    )
  );

create policy "Manager can record attendance" on public.attendance
  for insert with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste')
    )
  );

-- ============================================================================
-- Politique pour FUEL_TANKS
-- ============================================================================

drop policy if exists "Authorized roles can view fuel tanks" on public.fuel_tanks;

create policy "Authorized roles can view fuel tanks" on public.fuel_tanks
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste', 'hse')
    )
  );

create policy "Manager can update fuel tanks" on public.fuel_tanks
  for update using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste')
    )
  )
  with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste')
    )
  );

-- ============================================================================
-- Politique pour FUEL_SALES
-- ============================================================================

drop policy if exists "Authorized roles can view fuel sales" on public.fuel_sales;

create policy "Authorized roles can view fuel sales" on public.fuel_sales
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste', 'pompiste', 'hse')
    )
  );

create policy "Attendants can record fuel sales" on public.fuel_sales
  for insert with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste', 'pompiste')
    )
  );

-- ============================================================================
-- Politique pour SHOP_PRODUCTS
-- ============================================================================

drop policy if exists "Authorized roles can view shop products" on public.shop_products;

create policy "Authorized roles can view shop products" on public.shop_products
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_boutique', 'hotesse', 'hse')
    )
  );

create policy "Shop staff can update products" on public.shop_products
  for update using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_boutique')
    )
  )
  with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_boutique')
    )
  );

-- ============================================================================
-- Politique pour SHOP_SALES
-- ============================================================================

drop policy if exists "Authorized roles can view shop sales" on public.shop_sales;

create policy "Authorized roles can view shop sales" on public.shop_sales
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_boutique', 'hotesse', 'hse')
    )
  );

create policy "Shop staff can record sales" on public.shop_sales
  for insert with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_boutique', 'hotesse')
    )
  );

-- ============================================================================
-- Politique pour BAY_JOBS
-- ============================================================================

drop policy if exists "Authorized roles can view bay jobs" on public.bay_jobs;

create policy "Authorized roles can view bay jobs" on public.bay_jobs
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_baie', 'technicien', 'hse')
    )
  );

create policy "Bay staff can record jobs" on public.bay_jobs
  for insert with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_baie', 'technicien')
    )
  );

create policy "Bay staff can update jobs" on public.bay_jobs
  for update using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_baie', 'technicien')
    )
  )
  with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_baie', 'technicien')
    )
  );

-- ============================================================================
-- Politique pour FINANCIAL_TRANSACTIONS
-- ============================================================================

drop policy if exists "Managers can view financial transactions" on public.financial_transactions;

create policy "Managers and HSE can view financial transactions" on public.financial_transactions
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  );

create policy "Managers can record transactions" on public.financial_transactions
  for insert with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste', 'chef_boutique', 'chef_baie', 'hotesse')
    )
  );

-- ============================================================================
-- Politique pour DAILY_RECONCILIATION
-- ============================================================================

drop policy if exists "Managers can view reconciliation" on public.daily_reconciliation;

create policy "Managers and HSE can view reconciliation" on public.daily_reconciliation
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  );

create policy "Managers can record reconciliation" on public.daily_reconciliation
  for insert with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role = 'manager'
    )
  );

-- ============================================================================
-- Politique pour ALERTS
-- ============================================================================

drop policy if exists "Staff can view alerts" on public.alerts;

create policy "Staff can view alerts" on public.alerts
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

create policy "Manager and HSE can create/update alerts" on public.alerts
  for insert with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  );

create policy "Manager and HSE can update alerts" on public.alerts
  for update using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  )
  with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  );

-- ============================================================================
-- Politique pour TASKS
-- ============================================================================

drop policy if exists "Staff can view tasks" on public.tasks;

create policy "Staff can view tasks" on public.tasks
  for select using (
    station_id in (
      select station_id from public.station_staff where user_id = auth.uid()
    )
  );

create policy "Managers can create/update tasks" on public.tasks
  for insert with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role = 'manager'
    )
  );

create policy "Managers can update tasks" on public.tasks
  for update using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role = 'manager'
    )
  )
  with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role = 'manager'
    )
  );

-- ============================================================================
-- Politique pour PUMP_STATUS
-- ============================================================================

drop policy if exists "Authorized roles can view pump status" on public.pump_status;

create policy "Authorized roles can view pump status" on public.pump_status
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste', 'pompiste', 'hse')
    )
  );

create policy "Pump attendants can update pump status" on public.pump_status
  for update using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste', 'pompiste')
    )
  )
  with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'chef_piste', 'pompiste')
    )
  );

-- ============================================================================
-- Politique pour PERFORMANCE_RANKINGS
-- ============================================================================

drop policy if exists "Authorized roles can view rankings" on public.performance_rankings;

create policy "Authorized roles can view rankings" on public.performance_rankings
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  );

-- ============================================================================
-- Politique pour HSE_INCIDENTS
-- ============================================================================

drop policy if exists "HSE and managers can view incidents" on public.hse_incidents;

create policy "HSE and managers can view incidents" on public.hse_incidents
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('hse', 'manager')
    )
  );

create policy "HSE can create incidents" on public.hse_incidents
  for insert with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('hse', 'manager')
    )
  );

create policy "HSE can update incidents" on public.hse_incidents
  for update using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('hse', 'manager')
    )
  )
  with check (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('hse', 'manager')
    )
  );

-- ============================================================================
-- Politique pour KPI_CACHE
-- ============================================================================

drop policy if exists "Authorized roles can view kpi cache" on public.kpi_cache;

create policy "Authorized roles can view kpi cache" on public.kpi_cache
  for select using (
    station_id in (
      select station_id from public.station_staff
      where user_id = auth.uid()
      and role in ('manager', 'hse')
    )
  );
