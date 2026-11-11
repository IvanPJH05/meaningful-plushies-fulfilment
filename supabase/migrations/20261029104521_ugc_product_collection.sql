-- Existing all-product offers retain their eligibility. New offers explicitly choose a collection.
alter table public.marketing_ugc_samples add column product_collection text not null default 'ugc_all' check (product_collection in ('classics','plush_charms_v1','ugc_all'));
