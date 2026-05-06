-- Add disappearing messages & view-once media fields to messages table
ALTER TABLE "messages" ADD COLUMN "expires_at" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "is_view_once" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "viewed_at" TIMESTAMP(3);

-- Index for efficient cleanup of expired messages
CREATE INDEX "messages_expires_at_idx" ON "messages"("expires_at");
