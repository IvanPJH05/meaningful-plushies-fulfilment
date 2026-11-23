-- Increase only the existing private packing bucket. Permissions stay unchanged.
alter table public.packing_proof_videos drop constraint packing_proof_videos_source_size_check;
alter table public.packing_proof_videos add constraint packing_proof_videos_source_size_check check(source_size between 1 and 209715200);
update storage.buckets set file_size_limit=209715200 where id='packing-proof' and not public;

-- Preserve every current NFC, tracking, lease, and saved-object check in the
-- completion function; change only the warehouse video byte ceiling.
do $$
declare body text;
begin
 select pg_get_functiondef('public.packing_station_complete(uuid,uuid,uuid,text,integer)'::regprocedure) into body;
 if position('when proof.capture_mode=''warehouse'' then 24 else 12' in body)=0 then
  raise exception 'Unexpected packing completion definition; inspect before changing its size limit.';
 end if;
 execute replace(body,'when proof.capture_mode=''warehouse'' then 24 else 12','when proof.capture_mode=''warehouse'' then 200 else 12');
end $$;
