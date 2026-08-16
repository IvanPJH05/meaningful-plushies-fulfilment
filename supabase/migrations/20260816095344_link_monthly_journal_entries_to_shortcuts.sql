alter table public.monthly_journal_entries
  add column if not exists shortcut_id uuid references public.monthly_journal_shortcuts(id) on delete set null;

create index if not exists monthly_journal_entries_shortcut_id_idx
  on public.monthly_journal_entries(shortcut_id);
