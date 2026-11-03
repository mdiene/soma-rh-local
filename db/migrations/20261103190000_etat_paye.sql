-- État « Payé » affiché dans les pages de paie, repris de la fiche de paiement des salaires (salary_payments).
-- Deux vues en lecture seule (security_invoker : la RLS de salary_payments s'applique, soit rh et paie).

-- une ligne par bulletin ayant une fiche de paiement
create or replace view public.v_slip_payment_status with (security_invoker = true) as
select p.slip_id, s.payroll_entry_id, (p.status = 'Payé') as paid, p.paid_at, p.payment_mode, p.reference
  from public.salary_payments p
  join public.salary_slips s on s.id = p.slip_id
 where s.status <> 'Annulé';

-- avancement du paiement par paie : bulletins validés et bulletins payés
create or replace view public.v_payroll_entry_payments with (security_invoker = true) as
select s.payroll_entry_id, count(*) as slips, count(*) filter (where p.status = 'Payé') as paid
  from public.salary_slips s
  left join public.salary_payments p on p.slip_id = s.id
 where s.status = 'Validé'
 group by s.payroll_entry_id;

grant select on public.v_slip_payment_status, public.v_payroll_entry_payments to authenticated;
