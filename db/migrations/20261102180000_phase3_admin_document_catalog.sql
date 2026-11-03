-- Phase 3 D0/D1 : catalogue, versions et workflow du dossier administratif.

create table if not exists public.document_requirements (
  code                 text primary key,
  section_code         text not null check (section_code in (
    'identite', 'qualification', 'famille_social', 'aptitude_medicale', 'cas_specifiques'
  )),
  title                text not null,
  description          text not null,
  icon                  text,
  required              boolean not null default true,
  conditional_rule      text,
  allowed_mime_types    text[] not null default array['application/pdf', 'image/jpeg', 'image/png'],
  max_size_bytes        bigint not null default 10485760 check (max_size_bytes > 0),
  validity_days         integer check (validity_days is null or validity_days > 0),
  manager_shareable     boolean not null default false,
  active                boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now()
);

create table if not exists public.document_versions (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null references public.employee_documents(id) on delete cascade,
  version_number        integer not null check (version_number > 0),
  storage_path          text not null unique,
  file_name             text not null,
  mime_type              text not null,
  size_bytes            bigint not null check (size_bytes >= 0),
  checksum              text,
  uploaded_by           uuid not null default auth.uid() references auth.users(id) on delete restrict,
  uploaded_at           timestamptz not null default now(),
  unique (document_id, version_number)
);

create table if not exists public.document_reviews (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null references public.employee_documents(id) on delete cascade,
  status                text not null check (status in ('en_attente', 'valide', 'refuse')),
  reason                text,
  reviewed_by           uuid not null default auth.uid() references auth.users(id) on delete restrict,
  reviewed_at           timestamptz not null default now(),
  check (status <> 'refuse' or nullif(trim(reason), '') is not null)
);

create index if not exists document_versions_document_idx
  on public.document_versions(document_id, version_number desc);
create index if not exists document_reviews_document_idx
  on public.document_reviews(document_id, reviewed_at desc);
create index if not exists document_requirements_section_idx
  on public.document_requirements(section_code, sort_order);

alter table public.employee_documents
  add column if not exists requirement_code text references public.document_requirements(code),
  add column if not exists status text not null default 'en_attente',
  add column if not exists rejection_reason text,
  add column if not exists validated_by uuid references auth.users(id),
  add column if not exists validated_at timestamptz,
  add column if not exists current_version integer not null default 1,
  add column if not exists submitted_at timestamptz;

alter table public.employee_documents
  drop constraint if exists employee_documents_document_type_check;
alter table public.employee_documents
  add constraint employee_documents_document_type_check check (
    document_type in (
      'attestation_travail', 'attestation_salaire', 'bulletin', 'justificatif', 'autre',
      'piece_identite', 'acte_naissance', 'nationalite_residence', 'casier_judiciaire',
      'photo_identite', 'contacts_urgence', 'cv', 'diplomes_attestations',
      'certificats_travail', 'situation_matrimoniale', 'actes_enfants',
      'certificats_scolarite', 'immatriculation_sociale', 'aptitude_medicale',
      'absence_medicale_maternite', 'permis_visa', 'autorisation_parentale'
    )
  );
alter table public.employee_documents
  add constraint employee_documents_status_check check (status in ('en_attente', 'valide', 'refuse'));
alter table public.employee_documents
  add constraint employee_documents_rejection_reason_check check (
    status <> 'refuse' or nullif(trim(rejection_reason), '') is not null
  );

insert into public.document_requirements
  (code, section_code, title, description, icon, required, conditional_rule, sort_order)
values
  ('piece_identite', 'identite', 'Pièce d’identité', 'CIN, passeport, carte biométrique ou titre de séjour en cours de validité.', 'id-card', true, null, 10),
  ('acte_naissance', 'identite', 'Acte de naissance', 'Acte ou extrait de jugement supplétif.', 'file-text', true, null, 20),
  ('nationalite_residence', 'identite', 'Nationalité et résidence', 'Certificat de nationalité et certificat de résidence.', 'map-pin', true, null, 30),
  ('casier_judiciaire', 'identite', 'Casier judiciaire', 'Bulletin n°3 de moins de trois mois.', 'shield-check', true, null, 40),
  ('photo_identite', 'identite', 'Photo d’identité', 'Photo récente au format portrait.', 'camera', true, null, 50),
  ('contacts_urgence', 'identite', 'Contacts d’urgence', 'Fiche d’adresse et deux personnes à prévenir.', 'phone', true, null, 60),
  ('cv', 'qualification', 'CV à jour', 'Curriculum vitae à jour.', 'briefcase', true, null, 10),
  ('diplomes_attestations', 'qualification', 'Diplômes et attestations', 'Copies certifiées des qualifications.', 'graduation-cap', true, null, 20),
  ('certificats_travail', 'qualification', 'Certificats de travail', 'Certificats des emplois précédents.', 'building-2', true, null, 30),
  ('situation_matrimoniale', 'famille_social', 'Situation matrimoniale', 'Acte de mariage, célibat ou divorce.', 'heart', true, null, 10),
  ('actes_enfants', 'famille_social', 'Actes de naissance des enfants', 'Justificatifs nécessaires aux allocations et droits sociaux.', 'users', false, 'children_count > 0', 20),
  ('certificats_scolarite', 'famille_social', 'Certificats de scolarité', 'Certificats annuels des enfants à charge.', 'school', false, 'children_count > 0', 30),
  ('immatriculation_sociale', 'famille_social', 'Immatriculation sociale', 'Numéros CNSS, IPRES ou justificatif d’immatriculation.', 'landmark', false, null, 40),
  ('aptitude_medicale', 'aptitude_medicale', 'Certificat médical d’aptitude', 'Certificat délivré par la médecine du travail, de moins de trois mois.', 'heart-pulse', true, null, 10),
  ('absence_medicale_maternite', 'aptitude_medicale', 'Absence médicale ou maternité', 'Justificatif d’arrêt maladie ou de congé maternité, si applicable.', 'stethoscope', false, 'absence_active = true', 20),
  ('permis_visa', 'cas_specifiques', 'Permis de travail et visa', 'Autorisation, permis de travail et visa pour les étrangers.', 'globe-2', false, 'nationality <> Senegal', 10),
  ('autorisation_parentale', 'cas_specifiques', 'Autorisation parentale', 'Autorisation du représentant légal pour les salariés mineurs.', 'user-check', false, 'age < 18', 20)
on conflict (code) do update set
  section_code = excluded.section_code,
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  required = excluded.required,
  conditional_rule = excluded.conditional_rule,
  sort_order = excluded.sort_order,
  active = excluded.active;

alter table public.document_requirements enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_reviews enable row level security;

drop policy if exists document_requirements_read on public.document_requirements;
create policy document_requirements_read on public.document_requirements
  for select to authenticated
  using (active or (select public.has_role(array['rh'])));

drop policy if exists employee_documents_insert_self on public.employee_documents;
create policy employee_documents_insert_self on public.employee_documents
  for insert to authenticated
  with check (
    employee_id = (select public.my_employee_id())
    and created_by = (select auth.uid())
  );

drop policy if exists employee_documents_update_rh on public.employee_documents;
create policy employee_documents_update_rh on public.employee_documents
  for update to authenticated
  using ((select public.has_role(array['rh'])))
  with check ((select public.has_role(array['rh'])));

drop policy if exists document_versions_select on public.document_versions;
create policy document_versions_select on public.document_versions
  for select to authenticated
  using (
    (select public.has_role(array['rh']))
    or exists (
      select 1 from public.employee_documents d
      where d.id = document_id and d.employee_id = (select public.my_employee_id())
    )
  );

drop policy if exists document_versions_insert on public.document_versions;
create policy document_versions_insert on public.document_versions
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (select public.has_role(array['rh']))
      or exists (
        select 1 from public.employee_documents d
        where d.id = document_id and d.employee_id = (select public.my_employee_id())
      )
    )
  );

drop policy if exists document_reviews_select on public.document_reviews;
create policy document_reviews_select on public.document_reviews
  for select to authenticated
  using (
    (select public.has_role(array['rh']))
    or exists (
      select 1 from public.employee_documents d
      where d.id = document_id and d.employee_id = (select public.my_employee_id())
    )
  );

create or replace function public.review_employee_document(
  p_document_id uuid,
  p_status text,
  p_reason text default null
)
returns public.employee_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.employee_documents;
begin
  if not (select public.has_role(array['rh'])) then
    raise exception 'Droits RH requis';
  end if;
  if p_status not in ('valide', 'refuse') then
    raise exception 'Statut de validation invalide';
  end if;
  if p_status = 'refuse' and nullif(trim(p_reason), '') is null then
    raise exception 'Le motif de refus est obligatoire';
  end if;

  update public.employee_documents
  set status = p_status,
      rejection_reason = case when p_status = 'refuse' then trim(p_reason) else null end,
      validated_by = (select auth.uid()),
      validated_at = now()
  where id = p_document_id
  returning * into v_document;

  if not found then
    raise exception 'Document introuvable';
  end if;

  insert into public.document_reviews(document_id, status, reason, reviewed_by)
  values (p_document_id, p_status, case when p_status = 'refuse' then trim(p_reason) else null end, (select auth.uid()));
  return v_document;
end;
$$;

revoke execute on function public.review_employee_document(uuid, text, text) from public, anon;
grant execute on function public.review_employee_document(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
