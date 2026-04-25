-- Migrate checklist items from single assignee to multi-assignee
ALTER TABLE "checklist_items" ADD COLUMN IF NOT EXISTS "assignee_ids" TEXT[] DEFAULT '{}';
-- Copy existing single assignee to array
UPDATE "checklist_items" SET "assignee_ids" = ARRAY["assignee_id"] WHERE "assignee_id" IS NOT NULL;
-- Drop old column
ALTER TABLE "checklist_items" DROP COLUMN IF EXISTS "assignee_id";
