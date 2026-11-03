-- =============================================================================
-- L8 — Règlement : simulation, billetage, rapprochement, export bancaire (lecture seule)
--  L8-01 payment_summary : ordres de paiement simulés (net arrondi au franc) et contrôle I8
--  L8-02 cash_breakdown  : billetage des paiements en espèces
--  L8-03 payment_summary : rapprochement par mode + anomalies
--  L8-04 payment_export  : contrat d'export abstrait (colonnes stables, aucun format bancaire officiel)
-- Aucune écriture : le marquage « payé » reste fait par l'écran existant (salary_payments).
-- Invoker : la RLS s'applique ; rôle paie ou rh requis.
-- =============================================================================

-- Ordres de paiement d'une paie : un ordre par bulletin validé, montant = net arrondi au franc.
create or replace function public.payment_orders(p_payroll_entry_id uuid)
returns table (slip_id uuid, employee_id uuid, employee_number text, employee_name text, mode text, net_exact numeric, amount bigint, paid boolean)
language sql
stable
set search_path = ''
as $$
  select s.id, s.employee_id, s.employee_number, s.employee_name,
         coalesce(nullif(s.payment_mode, ''), 'espèces'), s.net_pay, round(s.net_pay)::bigint,
         coalesce(p.status = 'Payé', false)
    from public.salary_slips s
    left join public.salary_payments p on p.slip_id = s.id
   where s.payroll_entry_id = p_payroll_entry_id and s.status = 'Validé'
     and public.has_role(array['paie', 'rh'])
   order by s.employee_number
$$;

-- Simulation + rapprochement. ok = l'écart d'arrondi total ne dépasse pas un demi-franc par ordre (I8).
create or replace function public.payment_summary(p_payroll_entry_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_n integer; v_orders bigint; v_net numeric; v_by jsonb; v_anom jsonb := '[]'::jsonb;
begin
  if not public.has_role(array['paie', 'rh']) then
    raise exception 'Droits insuffisants : rôle « paie » ou « rh » requis';
  end if;
  select count(*), coalesce(sum(amount), 0), coalesce(sum(net_exact), 0)
    into v_n, v_orders, v_net from public.payment_orders(p_payroll_entry_id);

  select coalesce(jsonb_agg(jsonb_build_object('mode', mode, 'ordres', n, 'du', du, 'paye', paye, 'reste', du - paye) order by mode), '[]'::jsonb)
    into v_by
    from (select mode, count(*) as n, sum(amount) as du, coalesce(sum(amount) filter (where paid), 0) as paye
            from public.payment_orders(p_payroll_entry_id) group by mode) t;

  -- anomalies de rapprochement
  v_anom := v_anom || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'mode_different', 'matricule', o.employee_number,
             'message', 'Paiement enregistré en « ' || p.payment_mode || ' » alors que le bulletin prévoit « ' || o.mode || ' »'))
      from public.payment_orders(p_payroll_entry_id) o join public.salary_payments p on p.slip_id = o.slip_id
     where p.payment_mode <> o.mode), '[]'::jsonb);
  v_anom := v_anom || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'paiement_orphelin', 'matricule', s.employee_number,
             'message', 'Paiement enregistré sur un bulletin qui n''est plus validé (statut « ' || s.status || ' »)'))
      from public.salary_slips s join public.salary_payments p on p.slip_id = s.id
     where s.payroll_entry_id = p_payroll_entry_id and s.status <> 'Validé'), '[]'::jsonb);
  v_anom := v_anom || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'compte_manquant', 'matricule', o.employee_number,
             'message', 'Paiement par virement sans compte bancaire renseigné'))
      from public.payment_orders(p_payroll_entry_id) o join public.employees e on e.id = o.employee_id
     where o.mode ~* 'virement|banc' and coalesce(trim(e.bank_account), '') = ''), '[]'::jsonb);

  return jsonb_build_object(
    'ordres', v_n, 'total_ordres', v_orders, 'total_nets', v_net,
    'ecart_arrondi', v_orders - v_net, 'ecart_max', v_n * 0.5,
    'ok', abs(v_orders - v_net) <= v_n * 0.5,
    'par_mode', v_by, 'anomalies', v_anom);
end;
$$;

-- Billetage : dénominations FCFA, répartition gloutonne par salarié, total par coupure.
create or replace function public.cash_breakdown(p_payroll_entry_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c_denoms constant integer[] := array[10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5, 1];
  o record; d integer; rest bigint; k bigint;
  v_tot jsonb := '{}'::jsonb; v_emp jsonb := '[]'::jsonb; v_counts jsonb; v_total bigint := 0;
  v_cnt bigint[];
begin
  if not public.has_role(array['paie', 'rh']) then
    raise exception 'Droits insuffisants : rôle « paie » ou « rh » requis';
  end if;
  v_cnt := array_fill(0::bigint, array[array_length(c_denoms, 1)]);
  for o in select * from public.payment_orders(p_payroll_entry_id) where mode ~* 'esp' loop
    rest := o.amount; v_counts := '{}'::jsonb;
    for i in 1 .. array_length(c_denoms, 1) loop
      d := c_denoms[i]; k := rest / d; rest := rest - k * d;
      if k > 0 then v_counts := v_counts || jsonb_build_object(d::text, k); v_cnt[i] := v_cnt[i] + k; end if;
    end loop;
    v_total := v_total + o.amount;
    v_emp := v_emp || jsonb_build_object('matricule', o.employee_number, 'nom', o.employee_name, 'montant', o.amount, 'coupures', v_counts);
  end loop;
  for i in 1 .. array_length(c_denoms, 1) loop
    if v_cnt[i] > 0 then v_tot := v_tot || jsonb_build_object(c_denoms[i]::text, v_cnt[i]); end if;
  end loop;
  return jsonb_build_object('total_especes', v_total, 'coupures', v_tot, 'salaries', v_emp);
end;
$$;

-- Contrat d'export (colonnes stables) : ordre, matricule, nom, mode, banque, compte, montant, devise, reference, echeance.
-- Aucun format bancaire officiel (BSIC, BNDE à valider) : un adaptateur transformera ce contrat plus tard.
create or replace function public.payment_export(p_payroll_entry_id uuid, p_mode text default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare v jsonb; pe public.payroll_entries;
begin
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis pour exporter les ordres de paiement';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id;
  if not found then raise exception 'Traitement de paie introuvable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'ordre', t.rn, 'matricule', t.employee_number, 'nom', t.employee_name, 'mode', t.mode,
           'banque', t.bank_name, 'compte', t.bank_account, 'montant', t.amount, 'devise', 'XOF',
           'reference', 'PAIE-' || to_char(pe.period_start, 'YYYY-MM') || '-' || t.employee_number,
           'echeance', pe.period_end) order by t.rn), '[]'::jsonb)
    into v
    from (select row_number() over (order by o.employee_number) as rn, o.*, e.bank_name, e.bank_account
            from public.payment_orders(p_payroll_entry_id) o join public.employees e on e.id = o.employee_id
           where p_mode is null or o.mode = p_mode) t;
  return v;
end;
$$;

revoke all on function public.payment_orders(uuid) from public, anon;
revoke all on function public.payment_summary(uuid) from public, anon;
revoke all on function public.cash_breakdown(uuid) from public, anon;
revoke all on function public.payment_export(uuid, text) from public, anon;
grant execute on function public.payment_orders(uuid) to authenticated;
grant execute on function public.payment_summary(uuid) to authenticated;
grant execute on function public.cash_breakdown(uuid) to authenticated;
grant execute on function public.payment_export(uuid, text) to authenticated;
