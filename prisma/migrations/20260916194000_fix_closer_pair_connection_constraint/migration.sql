-- A shared connection ID belongs to both certificates in a pair. The original
-- unique index only allowed one certificate to be updated, leaving an orphaned
-- connection row and making later pairing attempts report a false "linked"
-- state.
DROP INDEX IF EXISTS "closer_app_certificates_connection_id_key";

-- Clear references that cannot describe a fully linked pair, then remove the
-- incomplete connection rows left by the earlier constraint.
UPDATE "closer_app_certificates" AS certificate
SET "connection_id" = NULL
WHERE "connection_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "closer_app_connections" AS connection
    JOIN "closer_app_certificates" AS first_certificate
      ON first_certificate."certificate_id" = connection."first_certificate_id"
    JOIN "closer_app_certificates" AS second_certificate
      ON second_certificate."certificate_id" = connection."second_certificate_id"
    WHERE connection."id" = certificate."connection_id"
      AND first_certificate."connection_id" = connection."id"
      AND second_certificate."connection_id" = connection."id"
  );

DELETE FROM "closer_app_connections" AS connection
WHERE NOT EXISTS (
  SELECT 1 FROM "closer_app_certificates" AS first_certificate
  WHERE first_certificate."certificate_id" = connection."first_certificate_id"
    AND first_certificate."connection_id" = connection."id"
)
OR NOT EXISTS (
  SELECT 1 FROM "closer_app_certificates" AS second_certificate
  WHERE second_certificate."certificate_id" = connection."second_certificate_id"
    AND second_certificate."connection_id" = connection."id"
);
