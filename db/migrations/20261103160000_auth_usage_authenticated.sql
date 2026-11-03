-- Correctif : « permission denied for schema auth » à la modification des présences (et de tout ce qui
-- appelle auth.uid() avec les droits de l'utilisateur : déclencheurs attendance_touch et reference_touch,
-- valeurs par défaut created_by / updated_by de 23 colonnes).
-- Sur Supabase, anon et authenticated ont le droit d'utiliser le schéma auth ; la base locale ne l'accordait
-- qu'à service_role. On aligne, sans ouvrir auth.users : seules les fonctions uid() et jwt() sont appelables.
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
