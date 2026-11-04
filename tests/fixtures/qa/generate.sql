-- =============================================================================
-- Usine de données QA : salariés fictifs déterministes (aucune donnée réelle).
-- Usage : psql -v n=25 -v extras=0 -v scenario=pme-25 -f generate.sql
--   n        nombre de salariés à générer
--   extras   1 = ajoute stagiaires, apprentis et prestataires
-- Idempotent : supprime d'abord les salariés QA* (voir reset.sql), puis recrée.
-- Déterminisme : aucun random() ; tout dérive de hashtext(indice || graine fixe).
-- Les matricules QA0001... remplacent ceux du déclencheur (triggers neutralisés
-- le temps de l'insertion, usage réservé à la base de développement).
-- =============================================================================
\set ON_ERROR_STOP on
\i tests/fixtures/qa/reset.sql

begin;
set local session_replication_role = replica;  -- neutralise audit et numérotation automatique

-- Unités organisationnelles (8 départements) si la société n'en a pas.
insert into public.departments (company_id, name, kind)
select c.id, d.name, 'service'
from public.companies c,
     (values ('QA Exploitation'),('QA Maintenance'),('QA Sécurité'),('QA Administration'),
             ('QA Logistique'),('QA Laboratoire'),('QA Finance'),('QA Ressources humaines')) d(name)
where not exists (select 1 from public.departments x where x.company_id = c.id and x.name = d.name);

create temp table qa_first(i int, v text);
insert into qa_first values (0,'Awa'),(1,'Moussa'),(2,'Fatou'),(3,'Ibrahima'),(4,'Aminata'),(5,'Cheikh'),
  (6,'Khady'),(7,'Mamadou'),(8,'Mariama'),(9,'Ousmane'),(10,'Ndèye'),(11,'Abdoulaye'),(12,'Sokhna'),
  (13,'Modou'),(14,'Rokhaya'),(15,'Pape'),(16,'Astou'),(17,'Samba'),(18,'Coumba'),(19,'Élimane');
create temp table qa_last(i int, v text);
insert into qa_last values (0,'Diop'),(1,'Ndiaye'),(2,'Fall'),(3,'Sow'),(4,'Gueye'),(5,'Sarr'),(6,'Ba'),
  (7,'Faye'),(8,'Cissé'),(9,'Diallo'),(10,'Mbaye'),(11,'Thiam'),(12,'Sy'),(13,'Kane'),(14,'Seck'),
  (15,'N''Diaye'),(16,'M''Baye'),(17,'Camara'),(18,'Diouf'),(19,'Sène');

create temp table qa_gen as
select g as i, abs(hashtext('qa-seed-42-' || g))::bigint as h
from generate_series(1, :n) g;

insert into public.employees (
  company_id, employee_number, first_name, last_name, gender, date_of_birth, nationality,
  marital_status, spouses_count, children_count, ir_parts, trimf_parts,
  employment_type, date_of_joining, contract_start, contract_end, relieving_date, exit_reason,
  agreement_code, payment_mode, status)
select
  (select id from public.companies limit 1),
  'QA' || lpad(g.i::text, 4, '0'),
  case when g.i = 3 then 'Marie-Thérèse Anne-Sophie' else f.v end,
  case when g.i = 4 then repeat('Ndiaye-', 9) || 'Diop'          -- nom très long
       when g.i = 5 then 'N''Diaye'                               -- apostrophe
       when g.i = 6 then 'Diop' else l.v end,                      -- homonyme avec 1 (voir plus bas)
  case when g.h % 2 = 0 then 'M' else 'F' end,
  date '1965-01-01' + ((g.h / 7) % 12000)::int,
  'Sénégalaise',
  m.ms,
  case when m.ms = 'Marié(e)' then 1 else 0 end,
  m.kids,
  least(5, 1 + (case when m.ms = 'Marié(e)' then 1 else 0 end) + m.kids * 0.5),
  least(5, 1 + (case when m.ms = 'Marié(e)' then 1 else 0 end) + m.kids * 0.5),
  t.typ,
  case when g.i = 7 then date '2026-11-16'                        -- embauche en cours de mois
       else date '2019-01-01' + ((g.h / 11) % 2500)::int end,
  case when t.typ = 'CDD' then date '2026-06-01' end,
  case when t.typ = 'CDD' then date '2026-11-04' + (case when g.i % 5 = 0 then 60 else 200 end) end,
  case when g.i = 8 then date '2026-11-20' end,                   -- départ en cours de mois
  case when g.i = 8 then 'DEMISSION' end,
  'INDUSTRIES_CHIMIQUES_EXTRATIVES_PROSPECTION_MINIERE',
  'espèces',
  case when g.i = 8 then 'Left' else 'Active' end
from qa_gen g
cross join lateral (select v from qa_first where qa_first.i = (g.h % 20)::int) f
cross join lateral (select v from qa_last  where qa_last.i  = ((g.h / 3) % 20)::int) l
cross join lateral (select case (g.h / 5) % 4 when 0 then 'Célibataire' when 1 then 'Marié(e)'
                                  when 2 then 'Marié(e)' else 'Divorcé(e)' end as ms,
                           ((g.h / 13) % 6)::int as kids) m
cross join lateral (select case
    when :extras = 0 then case when (g.h % 100) < 85 then 'CDI' else 'CDD' end
    when (g.h % 100) < 70 then 'CDI' when (g.h % 100) < 85 then 'CDD'
    when (g.h % 100) < 92 then 'STAGE' when (g.h % 100) < 96 then 'APPRENTISSAGE'
    else 'PRESTATION' end as typ) t;

-- Homonyme volontaire : le salarié 6 porte le prénom du salarié 1 (et le nom Diop).
update public.employees e set first_name = (select first_name from public.employees where employee_number = 'QA0001')
where e.employee_number = 'QA0006';

-- Rattachement aux départements, répartition régulière.
update public.employees e set department_id = d.id
from (select id, row_number() over (order by name) - 1 as rn from public.departments where name like 'QA %') d,
     qa_gen g
where e.employee_number = 'QA' || lpad(g.i::text, 4, '0') and d.rn = g.i % 8;

-- Rémunération. Cas aux bornes : QA0001 = plafond IPRES exact, QA0002 = plafond + 1 F,
-- QA0009 = salaire de base nul, QA0010 = plafond du régime cadres.
insert into public.salary_structure_assignments
  (employee_id, structure_id, from_date, base_salary, sursalaire, fees, other_fixed, transport_mode)
select e.id, (select id from public.salary_structures limit 1), date '2020-01-01',
  case g.i when 1 then 432000 when 2 then 432001 when 9 then 0 when 10 then 1296000
       else 100000 + ((g.h / 17) % 140) * 10000 end,
  case when g.i % 4 = 0 then 25000 else 0 end,
  case when e.employment_type = 'PRESTATION' then 150000 else 0 end,
  0,
  case g.i % 3 when 0 then 'Prime de transport' when 1 then 'Indemnité kilométrique' else 'Aucun' end
from qa_gen g join public.employees e on e.employee_number = 'QA' || lpad(g.i::text, 4, '0');

-- Cadres : salaires >= 600 000 F, rattachés à un grade « Cadres » (convention COMMERCE) pour l'IPRES complémentaire.
update public.employees e set agreement_code = 'COMMERCE',
  grade_id = (select id from public.employee_grades where agreement_code = 'COMMERCE' and staff_status = 'Cadres' order by code limit 1)
from public.salary_structure_assignments a
where a.employee_id = e.id and e.employee_number like 'QA%' and a.base_salary >= 600000;

commit;

select :'scenario' as scenario, count(*) as salaries_qa,
       count(*) filter (where employment_type = 'CDI') as cdi,
       count(*) filter (where employment_type = 'CDD') as cdd
from public.employees where employee_number like 'QA%';
