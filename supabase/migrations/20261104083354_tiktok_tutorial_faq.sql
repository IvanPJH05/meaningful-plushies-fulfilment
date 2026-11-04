create table public.tiktok_tutorial_faq_replies (
  shop_id text not null,
  message_id text not null,
  conversation_id text not null,
  received_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'uncertain')),
  reply_id text,
  error text,
  primary key (shop_id, message_id)
);
create index tiktok_tutorial_faq_pending on public.tiktok_tutorial_faq_replies (received_at) where status = 'pending';
alter table public.tiktok_tutorial_faq_replies enable row level security;
revoke all on public.tiktok_tutorial_faq_replies from public, anon, authenticated;
grant select, insert, update on public.tiktok_tutorial_faq_replies to service_role;
