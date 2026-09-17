-- Each plushie receives its own latest voice note. A sender's own inbox is
-- deliberately untouched when they record a message for their linked plushie.
alter table public.closer_app_connections
  add column if not exists first_voice_path text,
  add column if not exists first_voice_content_type text,
  add column if not exists second_voice_path text,
  add column if not exists second_voice_content_type text;
