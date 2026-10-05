-- ============================================================================
-- 4. Fonctions SQL utilitaires pour récupérer le rôle réel + rôle actif
-- ============================================================================

-- Fonction pour obtenir le rôle actif (vrai rôle ou rôle de test)
create or replace function public.get_active_role(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select
    case
      when ut.is_test_mode = true then ut.effective_role
      else p.platform_role
    end as active_role
  from public.profiles p
  left join public.user_test_context ut on ut.user_id = p.id
  where p.id = p_user_id;
$$;

-- Fonction pour obtenir l'état complet du rôle
create or replace function public.get_role_state(p_user_id uuid)
returns table (
  platform_role text,
  is_test_mode boolean,
  effective_role text,
  active_role text
)
language sql
security definer
set search_path = public
as $$
  select
    p.platform_role,
    coalesce(ut.is_test_mode, false),
    ut.effective_role,
    case
      when ut.is_test_mode = true then ut.effective_role
      else p.platform_role
    end as active_role
  from public.profiles p
  left join public.user_test_context ut on ut.user_id = p.id
  where p.id = p_user_id;
$$;

-- Fonction pour activer le mode de test
create or replace function public.enable_test_mode(
  p_user_id uuid,
  p_test_role text
)
returns table (
  success boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_platform_role text;
  v_valid_roles boolean;
begin
  -- Vérifier que l'utilisateur existe et qu'il est owner
  select platform_role into v_platform_role
  from public.profiles
  where id = p_user_id;

  if v_platform_role is null then
    return query select false::boolean, 'Utilisateur non trouvé'::text;
    return;
  end if;

  if v_platform_role != 'owner' then
    return query select false::boolean, 'Seul le propriétaire peut utiliser le mode de test'::text;
    return;
  end if;

  -- Vérifier que le rôle testé est valide
  v_valid_roles := p_test_role in (
    'owner', 'manager', 'chef_piste', 'chef_boutique', 'chef_baie',
    'hse', 'pompiste', 'hotesse', 'technicien'
  );

  if not v_valid_roles then
    return query select false::boolean, 'Rôle invalide'::text;
    return;
  end if;

  -- Activer le mode de test
  insert into public.user_test_context (
    user_id,
    is_test_mode,
    effective_role,
    test_session_started_at
  )
  values (
    p_user_id,
    true,
    p_test_role::text,
    now()
  )
  on conflict (user_id) do update
  set
    is_test_mode = true,
    effective_role = p_test_role::text,
    test_session_started_at = now(),
    updated_at = now();

  return query select true::boolean, 'Mode de test activé avec rôle: ' || p_test_role::text;
end;
$$;

-- Fonction pour désactiver le mode de test (retour au compte propriétaire)
create or replace function public.disable_test_mode(p_user_id uuid)
returns table (
  success boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_platform_role text;
begin
  -- Vérifier que l'utilisateur existe et qu'il est owner
  select platform_role into v_platform_role
  from public.profiles
  where id = p_user_id;

  if v_platform_role is null then
    return query select false::boolean, 'Utilisateur non trouvé'::text;
    return;
  end if;

  if v_platform_role != 'owner' then
    return query select false::boolean, 'Seul le propriétaire peut utiliser le mode de test'::text;
    return;
  end if;

  -- Désactiver le mode de test
  update public.user_test_context
  set
    is_test_mode = false,
    effective_role = 'owner',
    updated_at = now()
  where user_id = p_user_id;

  return query select true::boolean, 'Mode de test désactivé. Retour au compte propriétaire'::text;
end;
$$;

-- Fonction pour vérifier si un utilisateur a accès à un rôle donné
create or replace function public.user_can_access_role(
  p_user_id uuid,
  p_required_role text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    case
      when p.platform_role = 'owner' then true
      when p.platform_role = p_required_role then true
      when ut.is_test_mode = true and ut.effective_role = p_required_role then true
      else false
    end as can_access
  from public.profiles p
  left join public.user_test_context ut on ut.user_id = p.id
  where p.id = p_user_id;
$$;

-- Fonction pour obtenir la liste des stations accessibles
create or replace function public.get_user_accessible_stations(p_user_id uuid)
returns table (
  station_id uuid,
  station_name text,
  station_city text,
  owner_id uuid,
  platform_role text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.city,
    s.owner_id,
    p.platform_role
  from public.stations s
  join public.profiles p on s.owner_id = p.id
  where
    s.owner_id = p_user_id
    or exists (
      select 1 from public.station_staff ss
      where ss.station_id = s.id and ss.user_id = p_user_id
    )
  order by s.created_at desc;
$$;
