#!/bin/bash
# ============================================================
# Deploy project chat rooms + sidebar tab fixes to VPS
# 1. Pull latest code
# 2. Copy changed files to Docker build context
# 3. Rebuild and redeploy
# ============================================================

set -e
cd /root/exmsg

echo "===== Step 1: Pull latest code ====="
git stash 2>/dev/null || true
git pull origin main
git stash pop 2>/dev/null || true
echo "Code pulled successfully"

echo ""
echo "===== Step 2: Copy changed files to Docker build context ====="

# Backend: project controller + routes (new conversation endpoint)
cp packages/backend/src/modules/projects/project.controller.ts \
   /opt/omnilink/app/packages/backend/src/modules/projects/project.controller.ts

cp packages/backend/src/modules/projects/project.routes.ts \
   /opt/omnilink/app/packages/backend/src/modules/projects/project.routes.ts

# Frontend: api.ts (new createProjectConversation method)
cp packages/web/src/services/api.ts \
   /opt/omnilink/app/packages/web/src/services/api.ts

# Frontend: ProjectsPage.tsx (Start Chat button on project cards)
cp packages/web/src/components/projects/ProjectsPage.tsx \
   /opt/omnilink/app/packages/web/src/components/projects/ProjectsPage.tsx

# Frontend: Sidebar.tsx (smaller tabs, no scrollbar, removed Groups tab)
cp packages/web/src/components/sidebar/Sidebar.tsx \
   /opt/omnilink/app/packages/web/src/components/sidebar/Sidebar.tsx

echo "All files copied to Docker build context"

echo ""
echo "===== Step 3: Rebuild and deploy ====="
cd /opt/omnilink/app/docker
docker compose -f docker-compose.prod.yml up --build -d

echo ""
echo "Waiting for containers to start..."
sleep 20
docker ps --format "table {{.Names}}\t{{.Status}}"

echo ""
echo "===== Backend logs (last 15 lines) ====="
docker logs em-backend-prod --tail 15 2>&1

echo ""
echo "===== DONE! Project chat rooms + sidebar fixes deployed. ====="
