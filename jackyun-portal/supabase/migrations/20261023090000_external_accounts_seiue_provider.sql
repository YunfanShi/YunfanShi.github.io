alter table public.external_accounts
  drop constraint if exists external_accounts_provider_check;

alter table public.external_accounts
  add constraint external_accounts_provider_check
  check (provider in ('dida365', 'seiue'));

-- SEIUE stores one encrypted, short-lived authorization package in the existing
-- user-scoped secrets table. The plaintext package is only read by server APIs.
-- Keep RLS and foreign-key ownership checks from the original migration intact.
