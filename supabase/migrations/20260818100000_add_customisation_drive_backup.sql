alter table public.customisation_sessions
  add column if not exists google_drive_file_id text,
  add column if not exists google_drive_file_name text,
  add column if not exists google_drive_backed_up_at timestamptz,
  add column if not exists supabase_audio_deleted_at timestamptz,
  add column if not exists backup_error text;

create index if not exists customisation_sessions_retention_idx
  on public.customisation_sessions (completed_at)
  where voice_storage_path is not null and google_drive_backed_up_at is not null;
