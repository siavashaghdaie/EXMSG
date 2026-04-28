-- Add soft-delete fields to tasks
ALTER TABLE "tasks" ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tasks" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "deleted_by_id" TEXT;

-- Add foreign key for deletedBy
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for efficient filtering
CREATE INDEX "tasks_deleted_idx" ON "tasks"("deleted");
