-- Phase 3 ESS/MSS : marquage contrôlé des notifications comme lues.

create or replace function public.mark_employee_notification_read(
  p_notification_id uuid
)
returns public.employee_notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification public.employee_notifications;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentification requise';
  end if;

  update public.employee_notifications
     set read_at = coalesce(read_at, now())
   where id = p_notification_id
     and user_id = (select auth.uid())
  returning * into v_notification;

  if not found then
    raise exception 'Notification introuvable ou non autorisée';
  end if;

  return v_notification;
end;
$$;

revoke execute on function public.mark_employee_notification_read(uuid) from public, anon;
grant execute on function public.mark_employee_notification_read(uuid) to authenticated;
