-- Add conversation links to tasks and projects
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "conversation_id" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "conversation_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_conversation_id_key" ON "tasks"("conversation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "projects_conversation_id_key" ON "projects"("conversation_id");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
