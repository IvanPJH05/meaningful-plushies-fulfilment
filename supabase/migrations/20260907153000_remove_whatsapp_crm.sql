-- The former WhatsApp CRM was separate from fulfilment. Its UI and routes have
-- been removed. Keep only the shared media tables, because manual-order payment
-- receipts use those files and must remain available to fulfilment.

drop function if exists public.broadcast_crm_whatsapp_inbox_change() cascade;

drop table if exists public.crm_ai_tool_executions cascade;
drop table if exists public.crm_ai_runs cascade;
drop table if exists public.crm_ai_commands cascade;
drop table if exists public.crm_ai_agent_configs cascade;
drop table if exists public.crm_audit_logs cascade;
drop table if exists public.crm_checkout_sessions cascade;
drop table if exists public.crm_follow_ups cascade;
drop table if exists public.crm_lead_events cascade;
drop table if exists public.crm_leads cascade;
drop table if exists public.crm_message_attachments cascade;
drop table if exists public.crm_messages cascade;
drop table if exists public.crm_conversations cascade;
drop table if exists public.crm_contacts cascade;
drop table if exists public.crm_order_lines cascade;
drop table if exists public.crm_orders cascade;
drop table if exists public.crm_payments cascade;
drop table if exists public.crm_price_rules cascade;
drop table if exists public.crm_product_variants cascade;
drop table if exists public.crm_products cascade;
drop table if exists public.crm_promotions cascade;
drop table if exists public.crm_shopify_connections cascade;
drop table if exists public.crm_user_business_roles cascade;
drop table if exists public.crm_user_sessions cascade;
drop table if exists public.crm_users cascade;
drop table if exists public.crm_webhook_events cascade;
drop table if exists public.crm_whatsapp_connections cascade;
drop table if exists public.crm_whatsapp_flows cascade;
drop table if exists public.crm_whatsapp_media_jobs cascade;
