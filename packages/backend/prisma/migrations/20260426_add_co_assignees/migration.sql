ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "co_assignee_ids" TEXT[] DEFAULT '{}';
