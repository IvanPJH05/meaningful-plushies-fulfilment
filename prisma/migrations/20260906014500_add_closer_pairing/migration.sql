-- Customer-facing paired NFC plushie data. Kept separate from fulfilment and CRM records.
CREATE TYPE "CloserPairingRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "closer_app_certificates" (
  "id" TEXT NOT NULL,
  "certificate_id" TEXT NOT NULL,
  "access_key_hash" TEXT NOT NULL,
  "connection_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "closer_app_certificates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "closer_app_connections" (
  "id" TEXT NOT NULL,
  "first_certificate_id" TEXT NOT NULL,
  "second_certificate_id" TEXT NOT NULL,
  "first_name" TEXT NOT NULL,
  "second_name" TEXT NOT NULL,
  "next_photo_certificate_id" TEXT NOT NULL,
  "photo_path" TEXT,
  "photo_content_type" TEXT,
  "voice_path" TEXT,
  "voice_content_type" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "closer_app_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "closer_app_pairing_requests" (
  "id" TEXT NOT NULL,
  "from_certificate_id" TEXT NOT NULL,
  "to_certificate_id" TEXT NOT NULL,
  "requester_name" TEXT NOT NULL,
  "status" "CloserPairingRequestStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "closer_app_pairing_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "closer_app_activity" (
  "id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "actor_certificate_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "closer_app_activity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "closer_app_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "theme" JSONB NOT NULL DEFAULT '{}',
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "closer_app_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "closer_app_certificates_certificate_id_key" ON "closer_app_certificates"("certificate_id");
CREATE UNIQUE INDEX "closer_app_certificates_connection_id_key" ON "closer_app_certificates"("connection_id");
CREATE INDEX "closer_app_certificates_connection_id_idx" ON "closer_app_certificates"("connection_id");
CREATE UNIQUE INDEX "closer_app_connections_first_certificate_id_key" ON "closer_app_connections"("first_certificate_id");
CREATE UNIQUE INDEX "closer_app_connections_second_certificate_id_key" ON "closer_app_connections"("second_certificate_id");
CREATE INDEX "closer_app_connections_first_certificate_id_idx" ON "closer_app_connections"("first_certificate_id");
CREATE INDEX "closer_app_connections_second_certificate_id_idx" ON "closer_app_connections"("second_certificate_id");
CREATE INDEX "closer_app_pairing_requests_to_certificate_id_status_created_at_idx" ON "closer_app_pairing_requests"("to_certificate_id", "status", "created_at");
CREATE INDEX "closer_app_pairing_requests_from_certificate_id_status_created_at_idx" ON "closer_app_pairing_requests"("from_certificate_id", "status", "created_at");
CREATE INDEX "closer_app_activity_connection_id_created_at_idx" ON "closer_app_activity"("connection_id", "created_at");

ALTER TABLE "closer_app_certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "closer_app_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "closer_app_pairing_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "closer_app_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "closer_app_settings" ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('closer-app-media', 'closer-app-media', false, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg']::text[]);
