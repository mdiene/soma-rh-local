-- L8 : simulation des ordres (I8), billetage, rapprochement et contrat d'export.
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/l8_reglement.sql  (attendu : "OK l8_reglement")
-- Lecture seule ; les comptes et la paie sont pris dans la base. Aucun identifiant n'est écrit ici.
select user_id as u_paie from public.user_roles where role = 'paie' limit 1 \gset
select user_id as u_sal from public.user_roles group by user_id having bool_and(role = 'salarie') limit 1 \gset
select e.id as entry from public.payroll_entries e where exists (select 1 from public.salary_slips s where s.payroll_entry_id = e.id and s.status = 'Validé') order by e.period_start limit 1 \gset
begin;
select set_config('t.entry', :'entry', true) is not null;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'u_paie', true) is not null;

do $$
declare
  e uuid := current_setting('t.entry')::uuid; s jsonb; b jsonb; x jsonb; n int; tot bigint; sum_emp bigint; sum_coup bigint; k text; r record;
begin
  -- I8 : un ordre par bulletin validé, total des ordres = total des nets à l'arrondi près
  s := public.payment_summary(e);
  select count(*) into n from public.salary_slips where payroll_entry_id = e and status = 'Validé';
  if (s->>'ordres')::int <> n then raise exception 'I8 : % ordres pour % bulletins validés', s->>'ordres', n; end if;
  if not (s->>'ok')::boolean then raise exception 'I8 : écart d''arrondi % > %', s->>'ecart_arrondi', s->>'ecart_max'; end if;
  if abs((s->>'total_ordres')::numeric - (select sum(net_pay) from public.salary_slips where payroll_entry_id = e and status = 'Validé')) > n * 0.5 then
    raise exception 'I8 : total des ordres éloigné du total des nets';
  end if;

  -- billetage : les coupures de chaque salarié et du total reconstituent exactement les montants
  b := public.cash_breakdown(e);
  tot := (b->>'total_especes')::bigint;
  if tot <> (select coalesce(sum(amount), 0) from public.payment_orders(e) where mode ~* 'esp') then raise exception 'billetage : total des espèces incorrect'; end if;
  sum_coup := 0;
  for k in select jsonb_object_keys(b->'coupures') loop sum_coup := sum_coup + k::bigint * (b->'coupures'->>k)::bigint; end loop;
  if sum_coup <> tot then raise exception 'billetage : coupures % ≠ total %', sum_coup, tot; end if;
  for r in select v from jsonb_array_elements(b->'salaries') as t(v) loop
    sum_emp := 0;
    for k in select jsonb_object_keys(r.v->'coupures') loop sum_emp := sum_emp + k::bigint * (r.v->'coupures'->>k)::bigint; end loop;
    if sum_emp <> (r.v->>'montant')::bigint then raise exception 'billetage : salarié % : coupures % ≠ montant %', r.v->>'matricule', sum_emp, r.v->>'montant'; end if;
  end loop;

  -- export : colonnes du contrat, un ordre par bulletin, total = total des ordres
  x := public.payment_export(e, null);
  if jsonb_array_length(x) <> n then raise exception 'export : % lignes pour % ordres', jsonb_array_length(x), n; end if;
  if (select sum((v->>'montant')::bigint) from jsonb_array_elements(x) v) <> (s->>'total_ordres')::bigint then raise exception 'export : total ≠ total des ordres'; end if;
  if exists (select 1 from jsonb_array_elements(x) v where not (v ?& array['ordre','matricule','nom','mode','banque','compte','montant','devise','reference','echeance'])) then
    raise exception 'export : colonnes du contrat manquantes';
  end if;
  if exists (select 1 from jsonb_array_elements(x) v where v->>'devise' <> 'XOF') then raise exception 'export : devise'; end if;
end $$;

-- un simple salarié n'a accès à rien de tout cela
select set_config('request.jwt.claim.sub', :'u_sal', true) is not null;
do $$
declare e uuid := current_setting('t.entry')::uuid;
begin
  begin perform public.payment_summary(e); raise exception 'payment_summary ouvert à un salarié';
  exception when others then if sqlerrm not like 'Droits insuffisants%' then raise; end if; end;
  begin perform public.payment_export(e, null); raise exception 'payment_export ouvert à un salarié';
  exception when others then if sqlerrm not like 'Droits insuffisants%' then raise; end if; end;
end $$;

rollback;
select 'OK l8_reglement';
