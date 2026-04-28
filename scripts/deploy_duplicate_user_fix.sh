#!/bin/bash
# ============================================================
# Deploy duplicate-user fix to VPS
# 1. Apply code changes (displayName uniqueness guards)
# 2. Merge duplicate users in the database
# 3. Rebuild and redeploy
# ============================================================

set -e
cd /root/exmsg

echo "===== Step 1: Apply code fixes ====="

# Fix 1: Add displayName duplicate guard to org-admin invite
python3 -c "
import re

f = 'packages/backend/src/modules/org-admin/orgAdmin.controller.ts'
with open(f, 'r') as fh:
    content = fh.read()

old = '''      // Does this email already have an account?
      let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      let createdNewUser = false;

      if (!user) {
        // Create a brand new user with a placeholder password hash. The
        // invitee will set their real password via the invite link.
        const finalDisplayName = (displayName && String(displayName).trim()) || normalizedEmail.split('@')[0];'''

new = '''      // Does this email already have an account?
      let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      let createdNewUser = false;

      if (!user) {
        // ── Duplicate-name guard ───────────────────────────────────
        // Before creating a new user, check if someone with the same
        // display name (case-insensitive) already exists in this org.
        // This prevents \"two Sadeghs\" from appearing in the UI.
        const candidateDisplayName = (displayName && String(displayName).trim()) || normalizedEmail.split('@')[0];
        const existingByName = await prisma.user.findFirst({
          where: {
            displayName: { equals: candidateDisplayName, mode: 'insensitive' },
            organizations: { some: { organizationId: orgId } },
          },
          select: { id: true, email: true, displayName: true, username: true },
        });

        if (existingByName) {
          // A user with this display name is already in the org — warn admin
          res.status(409).json({
            error: \\'A member named \"\\' + existingByName.displayName + \\'\" already exists in this organization (\\' + existingByName.email + \\'). If this is the same person, use their existing email. If it\\\\'s a different person, please provide a distinct display name.\\',
            existingMember: {
              id: existingByName.id,
              email: existingByName.email,
              displayName: existingByName.displayName,
              username: existingByName.username,
            },
          });
          return;
        }

        // Create a brand new user with a placeholder password hash. The
        // invitee will set their real password via the invite link.
        const finalDisplayName = candidateDisplayName;'''

if old in content:
    content = content.replace(old, new)
    print('Fix 1 applied: Added displayName guard to org-admin invite')
else:
    print('Fix 1: Pattern not found (may already be applied)')

with open(f, 'w') as fh:
    fh.write(content)
"

# Fix 2: Add displayName duplicate guard to auth registration
python3 -c "
f = 'packages/backend/src/modules/auth/auth.controller.ts'
with open(f, 'r') as fh:
    content = fh.read()

# Check if the guard already exists
if 'displayNameDupe' in content:
    print('Fix 2: Already applied (displayNameDupe guard exists)')
else:
    # Insert the guard right before '// Hash password'
    old = '      // Hash password\n      const passwordHash = await bcrypt.hash(password, 12);'

    new = '''      // ── Duplicate display-name guard ─────────────────────────────
      // If another user already has this exact display name, reject with
      // a helpful message. This prevents two \"Sadegh\"s in the UI.
      const displayNameDupe = await prisma.user.findFirst({
        where: {
          displayName: { equals: displayName, mode: 'insensitive' },
          NOT: { email: { equals: email, mode: 'insensitive' } },
        },
        select: { id: true, displayName: true },
      });

      if (displayNameDupe) {
        res.status(409).json({
          error: 'The display name \"' + displayName + '\" is already taken. Please choose a different name or add a distinguishing detail (e.g. \"' + displayName + ' M.\" or \"' + displayName + ' (Dev)\").',
        });
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);'''

    if old in content:
        content = content.replace(old, new)
        print('Fix 2 applied: Added displayName guard to auth registration')
    else:
        print('Fix 2: Pattern not found')

    with open(f, 'w') as fh:
        fh.write(content)
"

echo ""
echo "===== Step 2: Copy to Docker build context ====="
cp packages/backend/src/modules/org-admin/orgAdmin.controller.ts /opt/omnilink/app/packages/backend/src/modules/org-admin/orgAdmin.controller.ts
cp packages/backend/src/modules/auth/auth.controller.ts /opt/omnilink/app/packages/backend/src/modules/auth/auth.controller.ts
echo "Copied to Docker build context"

echo ""
echo "===== Step 3: Merge duplicate users in database ====="

# Show duplicates first
echo "--- Current duplicates ---"
docker exec em-postgres-prod psql -U omnilink -d omnilink_messenger -c "
SELECT display_name, COUNT(*) as cnt,
       array_agg(id ORDER BY created_at) as user_ids,
       array_agg(email ORDER BY created_at) as emails
FROM users
WHERE display_name IS NOT NULL
  AND lower(display_name) NOT IN ('linda ai')
GROUP BY lower(display_name)
HAVING COUNT(*) > 1;
"

# Merge duplicates
echo "--- Merging ---"
docker exec em-postgres-prod psql -U omnilink -d omnilink_messenger -c "
DO \$\$
DECLARE
  rec RECORD;
  keeper_id UUID;
  dupe_id UUID;
  dname TEXT;
BEGIN
  FOR rec IN
    SELECT lower(display_name) as ldn
    FROM users
    WHERE display_name IS NOT NULL
      AND lower(display_name) NOT IN ('linda ai')
    GROUP BY lower(display_name)
    HAVING COUNT(*) > 1
  LOOP
    dname := rec.ldn;

    SELECT id INTO keeper_id
    FROM users WHERE lower(display_name) = dname
    ORDER BY created_at ASC LIMIT 1;

    FOR dupe_id IN
      SELECT id FROM users
      WHERE lower(display_name) = dname AND id != keeper_id
    LOOP
      RAISE NOTICE 'Merging % into % (name: %)', dupe_id, keeper_id, dname;

      UPDATE tasks SET assigned_to_id = keeper_id WHERE assigned_to_id = dupe_id;
      UPDATE tasks SET created_by_id = keeper_id WHERE created_by_id = dupe_id;
      UPDATE tasks SET ordered_by_id = keeper_id WHERE ordered_by_id = dupe_id;
      UPDATE tasks SET co_assignee_ids = array_replace(co_assignee_ids, dupe_id::text, keeper_id::text) WHERE dupe_id::text = ANY(co_assignee_ids);

      UPDATE conversation_members SET user_id = keeper_id WHERE user_id = dupe_id AND conversation_id NOT IN (SELECT conversation_id FROM conversation_members WHERE user_id = keeper_id);
      DELETE FROM conversation_members WHERE user_id = dupe_id;

      UPDATE messages SET sender_id = keeper_id WHERE sender_id = dupe_id;

      UPDATE organization_members SET user_id = keeper_id WHERE user_id = dupe_id AND organization_id NOT IN (SELECT organization_id FROM organization_members WHERE user_id = keeper_id);
      DELETE FROM organization_members WHERE user_id = dupe_id;

      UPDATE project_members SET user_id = keeper_id WHERE user_id = dupe_id AND project_id NOT IN (SELECT project_id FROM project_members WHERE user_id = keeper_id);
      DELETE FROM project_members WHERE user_id = dupe_id;

      UPDATE department_members SET user_id = keeper_id WHERE user_id = dupe_id AND department_id NOT IN (SELECT department_id FROM department_members WHERE user_id = keeper_id);
      DELETE FROM department_members WHERE user_id = dupe_id;

      UPDATE task_reactions SET user_id = keeper_id WHERE user_id = dupe_id AND task_id NOT IN (SELECT task_id FROM task_reactions WHERE user_id = keeper_id);
      DELETE FROM task_reactions WHERE user_id = dupe_id;

      BEGIN UPDATE task_comments SET user_id = keeper_id WHERE user_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;

      UPDATE message_reactions SET user_id = keeper_id WHERE user_id = dupe_id AND (message_id, emoji) NOT IN (SELECT message_id, emoji FROM message_reactions WHERE user_id = keeper_id);
      DELETE FROM message_reactions WHERE user_id = dupe_id;

      UPDATE read_receipts SET user_id = keeper_id WHERE user_id = dupe_id AND message_id NOT IN (SELECT message_id FROM read_receipts WHERE user_id = keeper_id);
      DELETE FROM read_receipts WHERE user_id = dupe_id;

      DELETE FROM refresh_tokens WHERE user_id = dupe_id;

      BEGIN UPDATE announcements SET created_by_id = keeper_id WHERE created_by_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;
      BEGIN UPDATE announcement_reads SET user_id = keeper_id WHERE user_id = dupe_id AND announcement_id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = keeper_id); DELETE FROM announcement_reads WHERE user_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;
      BEGIN UPDATE announcement_reactions SET user_id = keeper_id WHERE user_id = dupe_id AND announcement_id NOT IN (SELECT announcement_id FROM announcement_reactions WHERE user_id = keeper_id); DELETE FROM announcement_reactions WHERE user_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;
      BEGIN UPDATE announcement_comments SET user_id = keeper_id WHERE user_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;

      BEGIN UPDATE linda_conversations SET user_id = keeper_id WHERE user_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;
      BEGIN UPDATE linda_conversation_related_users SET user_id = keeper_id WHERE user_id = dupe_id AND conversation_id NOT IN (SELECT conversation_id FROM linda_conversation_related_users WHERE user_id = keeper_id); DELETE FROM linda_conversation_related_users WHERE user_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;

      BEGIN UPDATE user_statuses SET user_id = keeper_id WHERE user_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;
      BEGIN UPDATE status_views SET viewer_id = keeper_id WHERE viewer_id = dupe_id AND status_id NOT IN (SELECT status_id FROM status_views WHERE viewer_id = keeper_id); DELETE FROM status_views WHERE viewer_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;
      BEGIN UPDATE status_likes SET user_id = keeper_id WHERE user_id = dupe_id AND status_id NOT IN (SELECT status_id FROM status_likes WHERE user_id = keeper_id); DELETE FROM status_likes WHERE user_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;

      BEGIN UPDATE calls SET caller_id = keeper_id WHERE caller_id = dupe_id; UPDATE calls SET receiver_id = keeper_id WHERE receiver_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;
      BEGIN UPDATE projects SET created_by_id = keeper_id WHERE created_by_id = dupe_id; UPDATE projects SET team_lead_id = keeper_id WHERE team_lead_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;

      BEGIN UPDATE linda_activity_logs SET ordered_by_id = keeper_id WHERE ordered_by_id = dupe_id; UPDATE linda_activity_logs SET target_user_id = keeper_id WHERE target_user_id = dupe_id; EXCEPTION WHEN undefined_table THEN NULL; END;
      BEGIN UPDATE checklist_items SET assignee_ids = array_replace(assignee_ids, dupe_id::text, keeper_id::text) WHERE dupe_id::text = ANY(assignee_ids); EXCEPTION WHEN undefined_table THEN NULL; END;

      DELETE FROM users WHERE id = dupe_id;
      RAISE NOTICE 'Deleted duplicate user %', dupe_id;
    END LOOP;
  END LOOP;
END;
\$\$;
"

echo ""
echo "--- Verify no more duplicates ---"
docker exec em-postgres-prod psql -U omnilink -d omnilink_messenger -c "
SELECT display_name, COUNT(*) as cnt
FROM users WHERE display_name IS NOT NULL
GROUP BY lower(display_name) HAVING COUNT(*) > 1;
"

echo ""
echo "--- Final user list ---"
docker exec em-postgres-prod psql -U omnilink -d omnilink_messenger -c "
SELECT id, username, display_name, email FROM users ORDER BY created_at;
"

echo ""
echo "===== Step 4: Rebuild and deploy ====="
cd /opt/omnilink/app/docker
docker compose -f docker-compose.prod.yml up --build -d

echo ""
echo "Waiting for containers..."
sleep 20
docker ps --format "table {{.Names}}\t{{.Status}}"
echo ""
docker logs em-backend-prod --tail 10 2>&1

echo ""
echo "===== DONE! Duplicate users merged and prevention guards deployed. ====="
