-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'starter',
ADD COLUMN     "plan_status" TEXT NOT NULL DEFAULT 'active';
