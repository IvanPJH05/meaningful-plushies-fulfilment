-- Customer UGC incentives are distinct from creator samples and commissions.
create table public.marketing_ugc_samples (
 id uuid primary key,
 customer_name text not null check (length(trim(customer_name)) between 1 and 200),
 customer_url text not null default '',
 source_order_number text not null default '',
 sample_code text not null unique check (sample_code ~ '^UGC-[A-Z0-9_-]{1,60}$'),
 shopify_discount_id text not null default '',
 order_number text not null default '',
 notes text not null default '',
 status text not null default 'pending' check (status in ('pending','active','disabled')),
 created_by text not null,
 given_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index marketing_ugc_samples_given_at_idx on public.marketing_ugc_samples(given_at desc,id);
alter table public.marketing_ugc_samples enable row level security;
revoke all on public.marketing_ugc_samples from public,anon,authenticated;
grant select,insert,update on public.marketing_ugc_samples to service_role;
