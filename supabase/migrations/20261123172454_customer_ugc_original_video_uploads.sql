-- Originals are private; browsers receive a write-only capability for each file.
create table public.marketing_ugc_submission_videos (
 id uuid primary key,
 submission_id uuid not null references public.marketing_ugc_submissions(id) on delete cascade,
 file_name text not null check(length(file_name) between 1 and 200),
 content_type text not null check(content_type in ('video/mp4','video/quicktime','video/webm')),
 file_size bigint not null check(file_size>0 and file_size<=536870912000),
 storage_path text not null unique,
 status text not null default 'uploading' check(status in ('uploading','complete','removed')),
 created_at timestamptz not null default now(), completed_at timestamptz
);
create index marketing_ugc_submission_videos_parent_idx on public.marketing_ugc_submission_videos(submission_id);
alter table public.marketing_ugc_submission_videos enable row level security;
revoke all on public.marketing_ugc_submission_videos from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_ugc_submission_videos to service_role;

-- Serialize reservations, completion and final submission on the same parent.
create function public.manage_ugc_video(p_submission uuid,p_id uuid,p_action text,p_name text default '',p_type text default '',p_size bigint default 0)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_parent marketing_ugc_submissions%rowtype; v_file marketing_ugc_submission_videos%rowtype;
begin
 select * into v_parent from marketing_ugc_submissions where id=p_submission for update;
 if not found or v_parent.status<>'draft' then raise exception 'This submission has already been sent.'; end if;
 select * into v_file from marketing_ugc_submission_videos where id=p_id and submission_id=p_submission for update;
 if p_action='reserve' then
  if found then
   if v_file.status='removed' or v_file.file_name<>p_name or v_file.content_type<>p_type or v_file.file_size<>p_size then raise exception 'Choose the original file again.'; end if;
  else
   insert into marketing_ugc_submission_videos(id,submission_id,file_name,content_type,file_size,storage_path)
   values(p_id,p_submission,p_name,p_type,p_size,p_submission::text||'/'||p_id::text||'/original.'||case p_type when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' else 'webm' end)
   returning * into v_file;
  end if;
 elsif p_action='complete' then
  if not found or v_file.status='removed' then raise exception 'Video not found.'; end if;
  update marketing_ugc_submission_videos set status='complete',completed_at=coalesce(completed_at,now()) where id=p_id returning * into v_file;
 elsif p_action='remove' then
  if not found then raise exception 'Video not found.'; end if;
  update marketing_ugc_submission_videos set status='removed' where id=p_id returning * into v_file;
 else raise exception 'Invalid video action.'; end if;
 return to_jsonb(v_file);
end $$;

create function public.finish_ugc_original_submission(p_submission uuid,p_details jsonb)
returns text language plpgsql security invoker set search_path=public as $$
declare v_parent marketing_ugc_submissions%rowtype; v_first marketing_ugc_submission_videos%rowtype;
begin
 select * into v_parent from marketing_ugc_submissions where id=p_submission for update;
 if not found then raise exception 'Submission not found.'; end if;
 if v_parent.status<>'draft' then return 'UGC-'||upper(substr(p_submission::text,1,8)); end if;
 if (p_details->>'consent')::boolean is distinct from true then raise exception 'Content permission is required.'; end if;
 if exists(select 1 from marketing_ugc_submission_videos where submission_id=p_submission and status='uploading') then raise exception 'Wait for every video to finish uploading, or remove it.'; end if;
 select * into v_first from marketing_ugc_submission_videos where submission_id=p_submission and status='complete' order by created_at,id limit 1;
 if not found then raise exception 'Upload at least one video first.'; end if;
 update marketing_ugc_submissions set customer_name=p_details->>'customer_name',phone=p_details->>'phone',email=p_details->>'email',order_number=p_details->>'order_number',notes=coalesce(p_details->>'notes',''),consent=true,consent_text=p_details->>'consent_text',video_path=v_first.storage_path,video_name=v_first.file_name,status='pending',submitted_at=now(),updated_at=now() where id=p_submission;
 return 'UGC-'||upper(substr(p_submission::text,1,8));
end $$;
revoke all on function public.manage_ugc_video(uuid,uuid,text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.finish_ugc_original_submission(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.manage_ugc_video(uuid,uuid,text,text,text,bigint) to service_role;
grant execute on function public.finish_ugc_original_submission(uuid,jsonb) to service_role;
-- This removes the former 50 MB bucket restriction; project-wide limits still apply.
update storage.buckets set file_size_limit=536870912000 where id='customer-ugc';
