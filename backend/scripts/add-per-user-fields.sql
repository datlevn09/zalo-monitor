-- User: webhook secret + privacy
ALTER TABLE users ADD COLUMN IF NOT EXISTS "webhookSecret" TEXT;
UPDATE users SET "webhookSecret" = md5(random()::text || clock_timestamp()::text || id) WHERE "webhookSecret" IS NULL;
ALTER TABLE users ALTER COLUMN "webhookSecret" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_webhookSecret_key ON users("webhookSecret");

ALTER TABLE users ADD COLUMN IF NOT EXISTS "monitorDMs" BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "allowedDMIds" TEXT[] DEFAULT '{}';

-- Group: ownership
ALTER TABLE groups ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
CREATE INDEX IF NOT EXISTS groups_tenantId_ownerUserId_idx ON groups("tenantId", "ownerUserId");
