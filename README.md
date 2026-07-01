-- ============================================================
-- Ma Station — Schéma de base de données pour Supabase
-- ============================================================

-- Table : un enregistrement par pompiste par jour
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shift_date date not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, shift_date)
);

-- Table : profil de chaque pompiste (nom affiché, station)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  station_name text,
  created_at timestamptz not null default now()
);

-- Sécurité : chaque pompiste ne peut lire/modifier que SES PROPRES données
alter table shifts enable row level security;
alter table profiles enable row level security;

create policy "Lecture de ses propres services"
  on shifts for select
  using (auth.uid() = user_id);

create policy "Création de ses propres services"
  on shifts for insert
  with check (auth.uid() = user_id);

create policy "Modification de ses propres services"
  on shifts for update
  using (auth.uid() = user_id);

create policy "Lecture de son propre profil"
  on profiles for select
  using (auth.uid() = id);

create policy "Modification de son propre profil"
  on profiles for update
  using (auth.uid() = id);

create policy "Création de son propre profil"
  on profiles for insert
  with check (auth.uid() = id);

-- Création automatique du profil à l'inscription d'un nouvel utilisateur
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
