-- Correctif de L2 (idempotence, T-I19) : quand la dernière échéance d'un prêt était appliquée, le prêt passait
-- à « Soldé » et un recalcul de la même paie ne retenait plus l'échéance (le bulletin changeait entre deux
-- calculs identiques). Un prêt n'est écarté que s'il est « Annulé » ; un prêt « Soldé » redevient « Actif »
-- si une de ses échéances est libérée (période annulée).
create or replace function public.apply_period_adjustments(p_payroll_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pe public.payroll_entries;
  p date;
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants : rôle « rh » ou « paie » requis';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id;
  if not found or pe.status in ('Validée', 'Payée', 'Clôturée', 'Annulée') then return; end if;
  p := date_trunc('month', pe.period_start)::date;

  -- libère ce qui avait été appliqué à une période dont le traitement a été annulé
  update public.payroll_corrections c set status = 'En attente', applied_period = null
   where c.status = 'Appliquée' and c.applied_period is not null
     and not exists (select 1 from public.payroll_entries e
                      where date_trunc('month', e.period_start)::date = c.applied_period and e.status <> 'Annulée');
  update public.loan_installments i set status = 'Prévue', applied_period = null
   where i.status = 'Retenue' and i.applied_period is not null
     and not exists (select 1 from public.payroll_entries e
                      where date_trunc('month', e.period_start)::date = i.applied_period and e.status <> 'Annulée');

update public.loans l set status = 'Actif'   where l.status = 'Soldé' and exists (select 1 from public.loan_installments i where i.loan_id = l.id and i.status = 'Prévue');
  create temp table if not exists pg_temp.adj_desired (
    employee_id uuid, component_code text, amount numeric, kind text, source_id uuid
  ) on commit drop;
  truncate pg_temp.adj_desired;

  -- éléments récurrents (rubriques à saisie variable)
  insert into pg_temp.adj_desired
  select r.employee_id, r.component_code, r.amount, 'recurrent', r.id
    from public.recurring_pay_items r
    join public.salary_components c on c.code = r.component_code and c.input_mode = 'variable'
   where r.active and r.from_period <= p and (r.to_period is null or r.to_period >= p);

  -- échéances de prêt échues non encore retenues (ou déjà retenues dans cette période), une ligne par salarié
  insert into pg_temp.adj_desired
  select l.employee_id, 'RET_PRET', sum(i.amount), 'pret', null::uuid
    from public.loan_installments i join public.loans l on l.id = i.loan_id
   where l.status <> 'Annulé'
     and ((i.status = 'Prévue' and i.due_period <= p) or (i.status = 'Retenue' and i.applied_period = p))
   group by l.employee_id;

  -- régularisations en attente (ou déjà appliquées à cette période) venant d'un mois antérieur
  insert into pg_temp.adj_desired
  select c.employee_id, case c.kind when 'gain' then 'REGUL_BRUT' else 'RET_REGUL' end, sum(c.amount), 'regularisation', null::uuid
    from public.payroll_corrections c
   where c.source_period < p and (c.status = 'En attente' or (c.status = 'Appliquée' and c.applied_period = p))
   group by c.employee_id, c.kind;

  -- ne touche que ce qui a changé (pas de bruit dans l'audit à chaque recalcul)
  delete from public.additional_salaries a
   where a.period = p and a.kind <> 'ponctuel'
     and not exists (select 1 from pg_temp.adj_desired d
                      where d.employee_id = a.employee_id and d.component_code = a.component_code
                        and d.amount = a.amount and d.kind = a.kind and d.source_id is not distinct from a.source_id);

  insert into public.additional_salaries (employee_id, period, component_code, amount, kind, source_id, notes)
  select d.employee_id, p, d.component_code, d.amount, d.kind, d.source_id, 'Généré automatiquement'
    from pg_temp.adj_desired d
  on conflict (employee_id, period, component_code) do nothing;

  update public.loan_installments set status = 'Retenue', applied_period = p
   where due_period <= p and status = 'Prévue'
     and loan_id in (select id from public.loans where status <> 'Annulé');
  update public.payroll_corrections set status = 'Appliquée', applied_period = p
   where status = 'En attente' and source_period < p;
  update public.loans l set status = 'Soldé'
   where l.status = 'Actif' and not exists (select 1 from public.loan_installments i where i.loan_id = l.id and i.status = 'Prévue');
end;
$$;
