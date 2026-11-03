-- =============================================================================
-- SOMA-RH — 07 : les contextes serveur (clé service_role, console SQL postgres)
-- sont traités comme administrateurs par has_role(), à l'image de leur
-- contournement natif de la RLS. Permet les traitements batch côté serveur.
-- =============================================================================
create or replace function public.has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    session_user = 'postgres'
    or coalesce((select auth.jwt()) ->> 'role', '') = 'service_role'
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and (ur.role = any(p_roles) or ur.role = 'admin')
    );
$$;
