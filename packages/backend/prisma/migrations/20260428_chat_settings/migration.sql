-- Chat Settings Migration
-- Add disappearing messages to conversations
ALTER TABLE "conversations" ADD COLUMN "disappearing_seconds" INTEGER;

-- Extend conversation_members with per-user chat settings
ALTER TABLE "conversation_members" ADD COLUMN "mute_until" TIMESTAMP(3);
ALTER TABLE "conversation_members" ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversation_members" ADD COLUMN "is_locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversation_members" ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversation_members" ADD COLUMN "auto_translate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversation_members" ADD COLUMN "translate_lang" TEXT;
ALTER TABLE "conversation_members" ADD COLUMN "custom_notification_sound" TEXT;
ALTER TABLE "conversation_members" ADD COLUMN "chat_wallpaper" TEXT;
ALTER TABLE "conversation_members" ADD COLUMN "save_media" TEXT NOT NULL DEFAULT 'default';

-- Starred messages (per-user)
CREATE TABLE "starred_messages" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "starred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "starred_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "starred_messages_message_id_user_id_key" ON "starred_messages"("message_id", "user_id");

ALTER TABLE "starred_messages" ADD CONSTRAINT "starred_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "starred_messages" ADD CONSTRAINT "starred_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "starred_messages" ADD CONSTRAINT "starred_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Blocked users
CREATE TABLE "blocked_users" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blocked_users_blocker_id_blocked_id_key" ON "blocked_users"("blocker_id", "blocked_id");

ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reported users
CREATE TABLE "reported_users" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reported_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reported_users_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reported_users" ADD CONSTRAINT "reported_users_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reported_users" ADD CONSTRAINT "reported_users_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
