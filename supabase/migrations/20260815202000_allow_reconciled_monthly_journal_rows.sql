alter table public.monthly_journal_bank_rows
  drop constraint if exists monthly_journal_bank_rows_status_check;

alter table public.monthly_journal_bank_rows
  add constraint monthly_journal_bank_rows_status_check
  check (status in ('unposted', 'posted', 'reconciled'));
