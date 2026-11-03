-- Miniatures JPEG privées générées et conservées avec chaque document.

alter table public.employee_documents
  add column if not exists thumbnail_path text;

notify pgrst, 'reload schema';
