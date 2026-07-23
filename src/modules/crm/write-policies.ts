import { prisma } from "@/src/infrastructure/database/prisma";

let crmWritePoliciesReady: Promise<void> | null = null;

async function ensureCrmWritePoliciesOnce() {
  await prisma.$executeRawUnsafe(`
    do $$
    begin
      if to_regclass('public.crm_whatsapp_flows') is not null then
        alter table public.crm_whatsapp_flows enable row level security;

        drop policy if exists "shared crm reads whatsapp flows" on public.crm_whatsapp_flows;
        drop policy if exists "shared crm inserts whatsapp flows" on public.crm_whatsapp_flows;
        drop policy if exists "shared crm updates whatsapp flows" on public.crm_whatsapp_flows;
        drop policy if exists "shared crm deletes whatsapp flows" on public.crm_whatsapp_flows;
        drop policy if exists "shared crm changes whatsapp flows" on public.crm_whatsapp_flows;

        create policy "shared crm reads whatsapp flows" on public.crm_whatsapp_flows
          for select to public using (true);
        create policy "shared crm inserts whatsapp flows" on public.crm_whatsapp_flows
          for insert to public with check (true);
        create policy "shared crm updates whatsapp flows" on public.crm_whatsapp_flows
          for update to public using (true) with check (true);
        create policy "shared crm deletes whatsapp flows" on public.crm_whatsapp_flows
          for delete to public using (true);

        grant usage on schema public to public;
        grant select, insert, update, delete on public.crm_whatsapp_flows to public;
        grant all on table public.crm_whatsapp_flows to service_role;
      end if;

      if to_regclass('public.crm_media_assets') is not null then
        alter table public.crm_media_assets enable row level security;

        drop policy if exists "shared crm reads media assets" on public.crm_media_assets;
        drop policy if exists "shared crm inserts media assets" on public.crm_media_assets;
        drop policy if exists "shared crm updates media assets" on public.crm_media_assets;
        drop policy if exists "shared crm deletes media assets" on public.crm_media_assets;
        drop policy if exists "shared crm changes media assets" on public.crm_media_assets;

        create policy "shared crm reads media assets" on public.crm_media_assets
          for select to public using (true);
        create policy "shared crm inserts media assets" on public.crm_media_assets
          for insert to public with check (true);
        create policy "shared crm updates media assets" on public.crm_media_assets
          for update to public using (true) with check (true);
        create policy "shared crm deletes media assets" on public.crm_media_assets
          for delete to public using (true);

        grant usage on schema public to public;
        grant select, insert, update, delete on public.crm_media_assets to public;
        grant all on table public.crm_media_assets to service_role;
      end if;

      if to_regclass('storage.objects') is not null then
        drop policy if exists "shared crm reads whatsapp media files" on storage.objects;
        drop policy if exists "shared crm inserts whatsapp media files" on storage.objects;
        drop policy if exists "shared crm updates whatsapp media files" on storage.objects;
        drop policy if exists "shared crm deletes whatsapp media files" on storage.objects;

        create policy "shared crm reads whatsapp media files" on storage.objects
          for select to public using (bucket_id = 'whatsapp-media');
        create policy "shared crm inserts whatsapp media files" on storage.objects
          for insert to public with check (bucket_id = 'whatsapp-media');
        create policy "shared crm updates whatsapp media files" on storage.objects
          for update to public using (bucket_id = 'whatsapp-media') with check (bucket_id = 'whatsapp-media');
        create policy "shared crm deletes whatsapp media files" on storage.objects
          for delete to public using (bucket_id = 'whatsapp-media');

        grant select, insert, update, delete on storage.objects to public;
      end if;
    end $$;
  `);
}

export async function ensureCrmWritePolicies() {
  crmWritePoliciesReady ??= ensureCrmWritePoliciesOnce().catch((error) => {
    crmWritePoliciesReady = null;
    console.warn("CRM write policy repair could not run", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
  await crmWritePoliciesReady;
}

export function isRlsPolicyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("row-level security policy");
}
