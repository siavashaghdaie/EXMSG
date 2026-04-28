#!/bin/bash
# ============================================================
# Merge duplicate users on VPS
# This script:
# 1. Finds users with duplicate displayNames
# 2. Keeps the OLDEST account (first created), merges everything from newer ones
# 3. Reassigns all foreign-key references to the kept account
# 4. Deletes the duplicate account(s)
# ============================================================

cd /root/exmsg

echo "===== Step 1: Find duplicate users ====="
docker exec em-postgres-prod psql -U omnilink -d omnilink_messenger -c "
SELECT display_name, COUNT(*) as cnt,
       array_agg(id ORDER BY created_at) as user_ids,
       array_agg(email ORDER BY created_at) as emails,
       array_agg(username ORDER BY created_at) as usernames
FROM users
WHERE display_name IS NOT NULL
  AND lower(display_name) NOT IN ('linda ai')
GROUP BY lower(display_name)
HAVING COUNT(*) > 1
ORDER BY display_name;
"

echo ""
echo "===== Step 2: Merge duplicates (keep oldest, reassign from newest) ====="

# This runs a PL/pgSQL block that for each duplicate display_name:
# - Picks the oldest user as 'keeper'
# - Reassigns all references from the dupe to the keeper
# - Deletes the dupe
docker exec em-postgres-prod psql -U omnilink -d omnilink_messenger -c "
DO \$\$
DECLARE
  rec RECORD;
  keeper_id UUID;
  dupe_id UUID;
  dname TEXT;
BEGIN
  FOR rec IN
    SELECT lower(display_name) as ldn, MIN(id) as first_id
    FROM users
    WHERE display_name IS NOT NULL
      AND lower(display_name) NOT IN ('linda ai')
    GROUP BY lower(display_name)
    HAVING COUNT(*) > 1
  LOOP
    dname := rec.ldn;

    -- The keeper is the one with the earliest created_at
    SELECT id INTO keeper_id
    FROM users
    WHERE lower(display_name) = dname
    ORDER BY created_at ASC
    LIMIT 1;

    -- Loop over all duplicates (not the keeper)
    FOR dupe_id IN
      SELECT id FROM users
      WHERE lower(display_name) = dname AND id != keeper_id
      ORDER BY created_at ASC
    LOOP
      RAISE NOTICE 'Merging user % into keeper % (name: %)', dupe_id, keeper_id, dname;

      -- Tasks: reassign assigned_to, created_by, ordered_by
      UPDATE tasks SET assigned_to_id = keeper_id WHERE assigned_to_id = dupe_id;
      UPDATE tasks SET created_by_id = keeper_id WHERE created_by_id = dupe_id;
      UPDATE tasks SET ordered_by_id = keeper_id WHERE ordered_by_id = dupe_id;

      -- Task co-assignees (stored as text array)
      UPDATE tasks SET co_assignee_ids = array_replace(co_assignee_ids, dupe_id::text, keeper_id::text)
      WHERE dupe_id::text = ANY(co_assignee_ids);

      -- Conversation members: move if keeper not already in that conversation
      UPDATE conversation_members SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND conversation_id NOT IN (SELECT conversation_id FROM conversation_members WHERE user_id = keeper_id);
      DELETE FROM conversation_members WHERE user_id = dupe_id;

      -- Messages
      UPDATE messages SET sender_id = keeper_id WHERE sender_id = dupe_id;

      -- Organization members: move if keeper not already in that org
      UPDATE organization_members SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND organization_id NOT IN (SELECT organization_id FROM organization_members WHERE user_id = keeper_id);
      DELETE FROM organization_members WHERE user_id = dupe_id;

      -- Project members: move if keeper not already in that project
      UPDATE project_members SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND project_id NOT IN (SELECT project_id FROM project_members WHERE user_id = keeper_id);
      DELETE FROM project_members WHERE user_id = dupe_id;

      -- Department members: move if keeper not already in that dept
      UPDATE department_members SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND department_id NOT IN (SELECT department_id FROM department_members WHERE user_id = keeper_id);
      DELETE FROM department_members WHERE user_id = dupe_id;

      -- Task reactions
      UPDATE task_reactions SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND task_id NOT IN (SELECT task_id FROM task_reactions WHERE user_id = keeper_id);
      DELETE FROM task_reactions WHERE user_id = dupe_id;

      -- Task comments
      UPDATE task_comments SET user_id = keeper_id WHERE user_id = dupe_id;

      -- Message reactions
      UPDATE message_reactions SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND (message_id, emoji) NOT IN (SELECT message_id, emoji FROM message_reactions WHERE user_id = keeper_id);
      DELETE FROM message_reactions WHERE user_id = dupe_id;

      -- Read receipts
      UPDATE read_receipts SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND message_id NOT IN (SELECT message_id FROM read_receipts WHERE user_id = keeper_id);
      DELETE FROM read_receipts WHERE user_id = dupe_id;

      -- Refresh tokens
      DELETE FROM refresh_tokens WHERE user_id = dupe_id;

      -- Announcements
      UPDATE announcements SET created_by_id = keeper_id WHERE created_by_id = dupe_id;

      -- Announcement reads
      UPDATE announcement_reads SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND announcement_id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = keeper_id);
      DELETE FROM announcement_reads WHERE user_id = dupe_id;

      -- Announcement reactions
      UPDATE announcement_reactions SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND announcement_id NOT IN (SELECT announcement_id FROM announcement_reactions WHERE user_id = keeper_id);
      DELETE FROM announcement_reactions WHERE user_id = dupe_id;

      -- Announcement comments
      UPDATE announcement_comments SET user_id = keeper_id WHERE user_id = dupe_id;

      -- Linda conversations
      UPDATE linda_conversations SET user_id = keeper_id WHERE user_id = dupe_id;

      -- Linda related users
      UPDATE linda_conversation_related_users SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND conversation_id NOT IN (SELECT conversation_id FROM linda_conversation_related_users WHERE user_id = keeper_id);
      DELETE FROM linda_conversation_related_users WHERE user_id = dupe_id;

      -- User statuses (stories)
      UPDATE user_statuses SET user_id = keeper_id WHERE user_id = dupe_id;

      -- Status views
      UPDATE status_views SET viewer_id = keeper_id
      WHERE viewer_id = dupe_id
        AND status_id NOT IN (SELECT status_id FROM status_views WHERE viewer_id = keeper_id);
      DELETE FROM status_views WHERE viewer_id = dupe_id;

      -- Status likes
      UPDATE status_likes SET user_id = keeper_id
      WHERE user_id = dupe_id
        AND status_id NOT IN (SELECT status_id FROM status_likes WHERE user_id = keeper_id);
      DELETE FROM status_likes WHERE user_id = dupe_id;

      -- Calls
      UPDATE calls SET caller_id = keeper_id WHERE caller_id = dupe_id;
      UPDATE calls SET receiver_id = keeper_id WHERE receiver_id = dupe_id;

      -- Projects created by
      UPDATE projects SET created_by_id = keeper_id WHERE created_by_id = dupe_id;
      UPDATE projects SET team_lead_id = keeper_id WHERE team_lead_id = dupe_id;

      -- Linda activity logs (if table exists)
      BEGIN
        UPDATE linda_activity_logs SET ordered_by_id = keeper_id WHERE ordered_by_id = dupe_id;
        UPDATE linda_activity_logs SET target_user_id = keeper_id WHERE target_user_id = dupe_id;
      EXCEPTION WHEN undefined_table THEN NULL;
      END;

      -- Checklist item assignees (stored as text array)
      BEGIN
        UPDATE checklist_items SET assignee_ids = array_replace(assignee_ids, dupe_id::text, keeper_id::text)
        WHERE dupe_id::text = ANY(assignee_ids);
      EXCEPTION WHEN undefined_table THEN NULL;
      END;

      -- Now delete the duplicate user
      DELETE FROM users WHERE id = dupe_id;

      RAISE NOTICE 'Deleted duplicate user %', dupe_id;
    END LOOP;
  END LOOP;
END;
\$\$;
"

echo ""
echo "===== Step 3: Verify — no more duplicates ====="
docker exec em-postgres-prod psql -U omnilink -d omnilink_messenger -c "
SELECT display_name, COUNT(*) as cnt
FROM users
WHERE display_name IS NOT NULL
GROUP BY lower(display_name)
HAVING COUNT(*) > 1;
"

echo ""
echo "===== Step 4: Show final user list ====="
docker exec em-postgres-prod psql -U omnilink -d omnilink_messenger -c "
SELECT id, username, display_name, email, created_at
FROM users
ORDER BY created_at;
"

echo "Done! Duplicate users merged."
