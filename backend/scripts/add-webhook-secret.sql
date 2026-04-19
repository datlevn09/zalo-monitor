ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "webhookSecret" TEXT;
UPDATE tenants SET "webhookSecret" = md5(random()::text || clock_timestamp()::text || id) WHERE "webhookSecret" IS NULL;
ALTER TABLE tenants ALTER COLUMN "webhookSecret" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_webhooksecret_key ON tenants("webhookSecret");
