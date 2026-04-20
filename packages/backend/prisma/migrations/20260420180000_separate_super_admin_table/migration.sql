-- ============================================================
-- Separate SuperAdmin table from regular Users
-- ============================================================
-- Super admins are NOT regular messenger users. They only access
-- the back-office panel.  Having them in a separate table means
-- the same email can be used for both a super admin and a panel
-- owner without conflict.

-- 1. Create the super_admins table
CREATE TABLE IF NOT EXISTS "super_admins" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "super_admins_email_key" ON "super_admins"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "super_admins_username_key" ON "super_admins"("username");

-- 2. Migrate existing SUPER_ADMIN users to the new table
INSERT INTO "super_admins" ("id", "email", "username", "display_name", "password_hash", "created_at", "updated_at")
SELECT "id", "email", "username", "display_name",
       COALESCE("super_admin_hash", "password_hash"),
       "created_at", "updated_at"
FROM "users"
WHERE "role" = 'SUPER_ADMIN'
ON CONFLICT ("email") DO NOTHING;

-- 3. Remove SUPER_ADMIN users from the users table so the email is freed up
DELETE FROM "users" WHERE "role" = 'SUPER_ADMIN';
