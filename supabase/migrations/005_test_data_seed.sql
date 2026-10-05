-- ============================================================================
-- 5. Données de test pour développement + mode de test
-- ============================================================================

-- Récupérer l'ID du propriétaire
-- IMPORTANT: Adapter l'email si nécessaire

-- Créer une station de test
insert into public.stations (
  id,
  owner_id,
  name,
  address,
  city,
  phone,
  email,
  logo_url
)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  au.id,
  'Ma Station Centrale',
  'Route de la Gare, Kilomètre 5',
  'Yaoundé',
  '+237 690 000 000',
  'station@ma-station.cm',
  'https://via.placeholder.com/200?text=Ma+Station'
from auth.users au
where au.email = 'nanamiguel130@gmail.com'
on conflict (id) do nothing;

-- Créer du personnel de test
insert into public.station_staff (
  id,
  station_id,
  user_id,
  full_name,
  email,
  phone,
  role,
  status,
  hire_date
)
values
  ('22222222-2222-4222-8222-222222222222'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   (select id from auth.users where email = 'nanamiguel130@gmail.com'),
   'Nana Miguel - Gérant',
   'nanamiguel130@gmail.com',
   '+237 690 000 001',
   'manager',
   'active',
   '2024-01-01'::date
  ),
  ('33333333-3333-4333-8333-333333333333'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   null,
   'Jean Pompiste',
   'jean@ma-station.cm',
   '+237 690 000 002',
   'pompiste',
   'active',
   '2024-02-01'::date
  ),
  ('44444444-4444-4444-8444-444444444444'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   null,
   'Awa Hôtesse',
   'awa@ma-station.cm',
   '+237 690 000 003',
   'hotesse',
   'active',
   '2024-02-15'::date
  ),
  ('55555555-5555-4555-8555-555555555555'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   null,
   'Paul Technicien',
   'paul@ma-station.cm',
   '+237 690 000 004',
   'technicien',
   'active',
   '2024-03-01'::date
  ),
  ('66666666-6666-4666-8666-666666666666'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   null,
   'Marc Chef de Piste',
   'marc@ma-station.cm',
   '+237 690 000 005',
   'chef_piste',
   'active',
   '2024-01-15'::date
  ),
  ('77777777-7777-4777-8777-777777777777'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   null,
   'Sophie Chef Boutique',
   'sophie@ma-station.cm',
   '+237 690 000 006',
   'chef_boutique',
   'active',
   '2024-02-01'::date
  ),
  ('88888888-8888-4888-8888-888888888888'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   null,
   'Luc Chef de Baie',
   'luc@ma-station.cm',
   '+237 690 000 007',
   'chef_baie',
   'active',
   '2024-01-20'::date
  ),
  ('99999999-9999-4999-8999-999999999999'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   null,
   'Céline HSE',
   'celine@ma-station.cm',
   '+237 690 000 008',
   'hse',
   'active',
   '2024-03-10'::date
  )
on conflict (id) do nothing;

-- Créer des cuves de test
insert into public.fuel_tanks (
  id,
  station_id,
  tank_number,
  product_type,
  capacity_liters,
  current_level_liters,
  alert_threshold_percent,
  next_delivery_date
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Cuve 1',
   'essence',
   10000,
   7500,
   20,
   current_date + '7 days'::interval
  ),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Cuve 2',
   'diesel',
   10000,
   6200,
   20,
   current_date + '5 days'::interval
  ),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Cuve 3',
   'premium',
   8000,
   1500,
   20,
   current_date + '2 days'::interval
  ),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Cuve 4',
   'super_diesel',
   8000,
   4200,
   20,
   current_date + '10 days'::interval
  )
on conflict (id) do nothing;

-- Créer des pompes de test
insert into public.pump_status (
  id,
  station_id,
  pump_number,
  tank_id,
  is_active,
  current_attendant_id,
  status,
  shift_date
)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Pompe 1',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
   true,
   '33333333-3333-4333-8333-333333333333'::uuid,
   'dispensing',
   current_date
  ),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Pompe 2',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
   true,
   null,
   'idle',
   current_date
  ),
  ('00000000-0000-4000-8000-000000000000'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Pompe 3',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
   false,
   null,
   'offline',
   current_date
  )
on conflict (id) do nothing;

-- Créer des produits boutique
insert into public.shop_products (
  id,
  station_id,
  name,
  description,
  category,
  sku,
  purchase_price,
  selling_price,
  current_stock,
  alert_stock_threshold
)
values
  ('11aa1111-aa11-41a1-81aa-1111aa111111'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Eau minérale 1.5L',
   'Eau minérale pure',
   'beverages',
   'EAU-MIN-1L5',
   300,
   500,
   150,
   30
  ),
  ('22bb2222-bb22-42b2-82bb-2222bb222222'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Soda Fanta 33cl',
   'Boisson gazeuse',
   'beverages',
   'SODA-FANTA-33',
   250,
   400,
   200,
   50
  ),
  ('33cc3333-cc33-43c3-83cc-3333cc333333'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Biscuits LU',
   'Biscuits assortis',
   'snacks',
   'BISCUIT-LU',
   400,
   700,
   80,
   20
  ),
  ('44dd4444-dd44-44d4-84dd-4444dd444444'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Savon main 500ml',
   'Savon liquide',
   'hygiene',
   'SAVON-500ML',
   800,
   1200,
   40,
   10
  ),
  ('55ee5555-ee55-45e5-85ee-5555ee555555'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Air freshener',
   'Désodorisant voiture',
   'accessories',
   'AIR-FRESH',
   500,
   1000,
   60,
   15
  )
on conflict (id) do nothing;

-- Créer des services de baie
insert into public.bay_services (
  id,
  station_id,
  service_type,
  description,
  base_price
)
values
  ('1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'oil_change',
   'Changement d''huile moteur',
   8000
  ),
  ('2b2b2b2b-2b2b-42b2-82b2-2b2b2b2b2b2b'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'filter_change',
   'Changement des filtres',
   5000
  ),
  ('3c3c3c3c-3c3c-43c3-83c3-3c3c3c3c3c3c'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'greasing',
   'Graissage général',
   3000
  ),
  ('4d4d4d4d-4d4d-44d4-84d4-4d4d4d4d4d4d'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'tire_repair',
   'Réparation de pneu',
   6000
  ),
  ('5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'washing',
   'Lavage de véhicule',
   7000
  )
on conflict (id) do nothing;

-- Créer de la présence du personnel d'aujourd'hui
insert into public.attendance (
  id,
  staff_id,
  station_id,
  attendance_date,
  check_in_time,
  check_out_time,
  status
)
values
  ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0'::uuid,
   '22222222-2222-4222-8222-222222222222'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   current_date,
   '07:00:00'::time,
   null,
   'present'
  ),
  ('b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0'::uuid,
   '33333333-3333-4333-8333-333333333333'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   current_date,
   '07:15:00'::time,
   null,
   'late'
  ),
  ('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0'::uuid,
   '44444444-4444-4444-8444-444444444444'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   current_date,
   '07:00:00'::time,
   null,
   'present'
  ),
  ('d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0'::uuid,
   '55555555-5555-4555-8555-555555555555'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   current_date,
   null,
   null,
   'absent'
  )
on conflict (id) do nothing;

-- Créer quelques ventes de carburant d'aujourd'hui
insert into public.fuel_sales (
  id,
  station_id,
  tank_id,
  pump_id,
  attendant_id,
  quantity_liters,
  unit_price,
  total_amount,
  payment_method,
  sale_date,
  sale_time
)
values
  ('f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
   'Pompe 1',
   '33333333-3333-4333-8333-333333333333'::uuid,
   45,
   650,
   29250,
   'cash',
   current_date,
   '08:30:00'::time
  ),
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
   'Pompe 2',
   '33333333-3333-4333-8333-333333333333'::uuid,
   60,
   700,
   42000,
   'card',
   current_date,
   '09:15:00'::time
  ),
  ('d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
   'Pompe 3',
   null,
   35,
   750,
   26250,
   'cash',
   current_date,
   '10:00:00'::time
  )
on conflict (id) do nothing;

-- Créer quelques ventes boutique
insert into public.shop_sales (
  id,
  station_id,
  product_id,
  quantity,
  unit_price,
  total_amount,
  payment_method,
  sale_date,
  sale_time,
  cashier_id
)
values
  ('01010101-0101-4101-8101-010101010101'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   '11aa1111-aa11-41a1-81aa-1111aa111111'::uuid,
   5,
   500,
   2500,
   'cash',
   current_date,
   '08:45:00'::time,
   '44444444-4444-4444-8444-444444444444'::uuid
  ),
  ('02020202-0202-4202-8202-020202020202'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   '22bb2222-bb22-42b2-82bb-2222bb222222'::uuid,
   12,
   400,
   4800,
   'cash',
   current_date,
   '09:30:00'::time,
   '44444444-4444-4444-8444-444444444444'::uuid
  )
on conflict (id) do nothing;

-- Créer quelques travaux de baie
insert into public.bay_jobs (
  id,
  station_id,
  service_id,
  technician_id,
  vehicle_plate,
  customer_name,
  customer_phone,
  service_price,
  parts_cost,
  total_amount,
  payment_method,
  status,
  job_date,
  job_start_time,
  job_end_time
)
values
  ('03030303-0303-4303-8303-030303030303'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   '1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a'::uuid,
   '55555555-5555-4555-8555-555555555555'::uuid,
   'CM-123-ABC',
   'Jean Dupont',
   '+237 690 111 111',
   8000,
   3500,
   11500,
   'cash',
   'completed',
   current_date,
   '08:00:00'::time,
   '09:30:00'::time
  ),
  ('04040404-0404-4404-8404-040404040404'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   '2b2b2b2b-2b2b-42b2-82b2-2b2b2b2b2b2b'::uuid,
   '55555555-5555-4555-8555-555555555555'::uuid,
   'CM-456-XYZ',
   'Marie Martin',
   '+237 690 222 222',
   5000,
   2000,
   7000,
   'card',
   'in_progress',
   current_date,
   '10:00:00'::time,
   null
  )
on conflict (id) do nothing;

-- Créer des alertes
insert into public.alerts (
  id,
  station_id,
  alert_type,
  severity,
  title,
  description,
  is_resolved
)
values
  ('05050505-0505-4505-8505-050505050505'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'low_tank',
   'high',
   'Cuve Premium basse',
   'La cuve de carburant premium (Cuve 3) a atteint seulement 1500 litres. Prochaine livraison prévue dans 2 jours.',
   false
  ),
  ('06060606-0606-4606-8606-060606060606'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'staff_absence',
   'medium',
   'Technicien absent',
   'Paul Technicien est marqué absent aujourd''hui.',
   false
  ),
  ('07070707-0707-4707-8707-070707070707'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'low_shop_stock',
   'low',
   'Stock de biscuits faible',
   'Les biscuits LU ont un stock de 80 unités (seuil: 20). À réapprovisionner.',
   false
  )
on conflict (id) do nothing;

-- Créer des tâches
insert into public.tasks (
  id,
  station_id,
  title,
  description,
  task_type,
  assigned_to,
  status,
  priority,
  due_date
)
values
  ('08080808-0808-4808-8808-080808080808'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Réunion du personnel',
   'Réunion hebdomadaire avec tous les chefs d''équipe',
   'meeting',
   '22222222-2222-4222-8222-222222222222'::uuid,
   'pending',
   'high',
   current_date + '1 day'::interval
  ),
  ('09090909-0909-4909-8909-090909090909'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'Contrôle d''équipements',
   'Vérifier l''état de toutes les pompes',
   'task',
   '66666666-6666-4666-8666-666666666666'::uuid,
   'in_progress',
   'medium',
   current_date + '3 days'::interval
  )
on conflict (id) do nothing;

-- Créer le cache KPI d'aujourd'hui
insert into public.kpi_cache (
  id,
  station_id,
  kpi_date,
  daily_revenue,
  daily_fuel_volume,
  daily_customers_count,
  daily_payments_received,
  previous_day_revenue,
  previous_day_fuel_volume,
  previous_day_customers_count,
  previous_day_payments_received
)
values
  ('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   current_date,
   97500,
   140,
   42,
   97500,
   105000,
   145,
   48,
   105000
)
on conflict (station_id, kpi_date) do nothing;

-- Créer des classements de performance
insert into public.performance_rankings (
  id,
  station_id,
  staff_id,
  ranking_type,
  period,
  period_date,
  rank,
  score,
  sales_total,
  customers_served,
  transactions_count,
  quality_rating
)
values
  ('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   '33333333-3333-4333-8333-333333333333'::uuid,
   'pump_attendant',
   'daily',
   current_date,
   1,
   95.5,
   97500,
   42,
   97,
   9.5
  ),
  ('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c'::uuid,
   '11111111-1111-4111-8111-111111111111'::uuid,
   '44444444-4444-4444-8444-444444444444'::uuid,
   'hostess',
   'daily',
   current_date,
   1,
   92.0,
   7300,
   28,
   67,
   9.2
  )
on conflict (station_id, staff_id, ranking_type, period, period_date) do nothing;
