-- ============================================================
-- Fix duplicate users: find and merge users with same displayName
-- Run inside em-postgres-prod container:
--   docker exec em-postgres-prod psql -U omnilink -d omnilink_messenger -f /tmp/fix_duplicate_users.sql
-- ============================================================

-- First, show all duplicate displayNames
SELECT display_name, COUNT(*) as cnt,
       array_agg(id ORDER BY created_at) as user_ids,
       array_agg(email ORDER BY created_at) as emails,
       array_agg(username ORDER BY created_at) as usernames,
       array_agg(created_at ORDER BY created_at) as created_dates
FROM users
WHERE display_name IS NOT NULL
GROUP BY lower(display_name), display_name
HAVING COUNT(*) > 1
ORDER BY display_name;
