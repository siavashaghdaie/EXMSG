-- ============================================================
-- Multi-tenant isolation: scope data per organization (panel)
-- ============================================================

-- 1. Organization: add visibility column
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'private';

-- 2. Conversations: link to organization
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "is_inter_panel" BOOLEAN NOT NULL DEFAULT false;

-- Back-fill existing conversations: assign them to the org of the first member
UPDATE "conversations" c
SET "organization_id" = (
  SELECT om."organization_id"
  FROM "conversation_members" cm
  JOIN "organization_members" om ON om."user_id" = cm."user_id"
  WHERE cm."conversation_id" = c."id"
  LIMIT 1
)
WHERE c."organization_id" IS NULL;

CREATE INDEX IF NOT EXISTS "conversations_organization_id_idx" ON "conversations"("organization_id");

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Tasks: link to organization
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

-- Back-fill existing tasks
UPDATE "tasks" t
SET "organization_id" = (
  SELECT om."organization_id"
  FROM "organization_members" om
  WHERE om."user_id" = t."created_by_id"
  LIMIT 1
)
WHERE t."organization_id" IS NULL;

CREATE INDEX IF NOT EXISTS "tasks_organization_id_idx" ON "tasks"("organization_id");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Announcements: link to organization
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

-- Back-fill existing announcements
UPDATE "announcements" a
SET "organization_id" = (
  SELECT om."organization_id"
  FROM "organization_members" om
  WHERE om."user_id" = a."author_id"
  LIMIT 1
)
WHERE a."organization_id" IS NULL;

CREATE INDEX IF NOT EXISTS "announcements_organization_id_idx" ON "announcements"("organization_id");

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Inter-panel requests table
CREATE TABLE IF NOT EXISTS "inter_panel_requests" (
  "id" TEXT NOT NULL,
  "sender_org_id" TEXT NOT NULL,
  "receiver_org_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "conversation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "inter_panel_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inter_panel_requests_sender_org_id_receiver_org_id_key"
  ON "inter_panel_requests"("sender_org_id", "receiver_org_id");

CREATE UNIQUE INDEX IF NOT EXISTS "inter_panel_requests_conversation_id_key"
  ON "inter_panel_requests"("conversation_id");

CREATE INDEX IF NOT EXISTS "inter_panel_requests_receiver_org_id_status_idx"
  ON "inter_panel_requests"("receiver_org_id", "status");

ALTER TABLE "inter_panel_requests"
  ADD CONSTRAINT "inter_panel_requests_sender_org_id_fkey"
  FOREIGN KEY ("sender_org_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inter_panel_requests"
  ADD CONSTRAINT "inter_panel_requests_receiver_org_id_fkey"
  FOREIGN KEY ("receiver_org_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inter_panel_requests"
  ADD CONSTRAINT "inter_panel_requests_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
