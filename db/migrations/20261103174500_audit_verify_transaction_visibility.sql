-- audit_verify() must observe writes made earlier in the same transaction.
alter function public.audit_verify() volatile;
