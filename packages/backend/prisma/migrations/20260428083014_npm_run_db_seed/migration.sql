-- DropForeignKey
ALTER TABLE "task_attachments" DROP CONSTRAINT "task_attachments_uploaded_by_id_fkey";

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
