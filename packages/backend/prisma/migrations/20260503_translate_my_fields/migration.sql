-- Add translate-my-messages fields to conversation_members
ALTER TABLE "conversation_members" ADD COLUMN "translate_my_from" TEXT;
ALTER TABLE "conversation_members" ADD COLUMN "translate_my_to" TEXT;
