create table public.marketing_ugc_submissions (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique,
 client_hash text not null,
 status text not null default 'draft' check(status in ('draft','pending','approved','rejected')),
 customer_name text not null default '', phone text not null default '', email text not null default '',
 order_number text not null default '', notes text not null default '',
 consent boolean not null default false, consent_text text not null default '',
 video_path text not null default '', video_name text not null default '',
 reward_id uuid unique references public.marketing_ugc_samples(id),
 review_notes text not null default '', reviewed_by text not null default '', reviewed_at timestamptz,
 created_at timestamptz not null default now(), submitted_at timestamptz, updated_at timestamptz not null default now()
);
create index marketing_ugc_submissions_queue_idx on public.marketing_ugc_submissions(status,submitted_at desc);
create index marketing_ugc_submissions_client_idx on public.marketing_ugc_submissions(client_hash,created_at);
alter table public.marketing_ugc_submissions enable row level security;
revoke all on public.marketing_ugc_submissions from public,anon,authenticated;
grant select,insert,update on public.marketing_ugc_submissions to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('customer-ugc','customer-ugc',false,52428800,array['video/mp4','video/quicktime','video/webm'])
 on conflict(id) do nothing;

create function public.start_ugc_submission(p_token_hash text,p_client_hash text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_client_hash,0));
 if (select count(*) from marketing_ugc_submissions where client_hash=p_client_hash and created_at>now()-interval '1 hour')>=5 then
 raise exception 'Too many attempts. Please try again in an hour.'; end if;
 insert into marketing_ugc_submissions(token_hash,client_hash) values(p_token_hash,p_client_hash) returning id into v_id;
 return v_id;
end $$;

create function public.review_ugc_submission(p_id uuid,p_expected_updated_at timestamptz,p_action text,p_actor text,p_notes text,p_collection text,p_code text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_row marketing_ugc_submissions%rowtype;
begin
 select * into v_row from marketing_ugc_submissions where id=p_id for update;
 if not found then raise exception 'Submission not found.'; end if;
 if v_row.status='approved' and p_action='approve' then return v_row.reward_id; end if;
 if v_row.status <> 'pending' or v_row.updated_at<>p_expected_updated_at then raise exception 'This submission changed. Refresh before reviewing.'; end if;
 if p_action='reject' then
 update marketing_ugc_submissions set status='rejected',review_notes=p_notes,reviewed_by=p_actor,reviewed_at=now(),updated_at=now() where id=p_id;
 return null;
 elsif p_action='approve' then
 if not v_row.consent or v_row.video_path='' then raise exception 'A video and content permission are required.'; end if;
 insert into marketing_ugc_samples(id,customer_name,source_order_number,sample_code,notes,product_collection,created_by)
 values(v_row.id,v_row.customer_name,v_row.order_number,p_code,p_notes,p_collection,p_actor);
 update marketing_ugc_submissions set status='approved',reward_id=v_row.id,review_notes=p_notes,reviewed_by=p_actor,reviewed_at=now(),updated_at=now() where id=p_id;
 return v_row.id;
 else raise exception 'Invalid review action.'; end if;
end $$;
revoke all on function public.start_ugc_submission(text,text) from public,anon,authenticated;
revoke all on function public.review_ugc_submission(uuid,timestamptz,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.start_ugc_submission(text,text) to service_role;
grant execute on function public.review_ugc_submission(uuid,timestamptz,text,text,text,text,text) to service_role;
