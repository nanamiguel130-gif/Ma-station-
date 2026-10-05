-- ============================================================================
-- 3. Définir explicitement ton compte propriétaire
--    Le compte @gmail reste owner, sans le transformer en pompiste ou autre.
-- ============================================================================

insert into public.profiles (
  id,
  email,
  full_name,
  platform_role
)
select
  au.id,
  au.email,
  coalesce(au.raw_user_meta_data ->> 'full_name', 'Nana Miguel'),
  'owner'
from auth.users au
where au.email = 'nanamiguel130@gmail.com'
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  platform_role = 'owner',
  updated_at = now();

insert into public.user_test_context (
  user_id,
  is_test_mode,
  effective_role
)
select
  au.id,
  false,
  'owner'
from auth.users au
where au.email = 'nanamiguel130@gmail.com'
on conflict (user_id) do update
set
  is_test_mode = false,
  effective_role = 'owner',
  updated_at = now();
