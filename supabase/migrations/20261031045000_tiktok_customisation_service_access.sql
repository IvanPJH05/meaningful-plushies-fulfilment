-- The trigger invokes the private readiness helper under the server role.
-- No access is granted to browser roles.
grant usage on schema internal to service_role;
