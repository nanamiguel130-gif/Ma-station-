-- ============================================================================
-- 2. TRIGGER AUTO: Créer un profil + contexte de test dès qu'un utilisateur
--    s'inscrit dans auth.users
--    IMPORTANT: platform_role reste toujours le vrai rôle, jamais modifié par le test.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rôle réel selon email
  -- Si c'est ton compte de test propriétaire -> owner
  -- Sinon, on attribue manager par défaut pour les nouveaux comptes
  insert into public.profiles (
    id,
    email,
    full_name,
    platform_role
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case
      when new.email = 'nanamiguel130@gmail.com' then 'owner'
      else 'manager'
    end
  )
  on conflict (id) do nothing;

  -- Contexte de test personnel
  insert into public.user_test_context (
    user_id,
    is_test_mode,
    effective_role
  )
  values (
    new.id,
    false,
    case
      when new.email = 'nanamiguel130@gmail.com' then 'owner'
      else 'manager'
    end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
