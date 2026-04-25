-- ============================================================
-- Add Departments, Projects, Checklists, and related Task fields
-- ============================================================

-- 1. Departments
CREATE TABLE IF NOT EXISTS "departments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "departments_organization_id_name_key" ON "departments"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "departments_organization_id_idx" ON "departments"("organization_id");

ALTER TABLE "departments"
  ADD CONSTRAINT "departments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Department Members
CREATE TABLE IF NOT EXISTS "department_members" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "department_members_department_id_user_id_key" ON "department_members"("department_id", "user_id");
CREATE INDEX IF NOT EXISTS "department_members_user_id_idx" ON "department_members"("user_id");

ALTER TABLE "department_members"
  ADD CONSTRAINT "department_members_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "department_members"
  ADD CONSTRAINT "department_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Projects
CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "specs_and_goals" TEXT,
    "git_url" TEXT,
    "storage_url" TEXT,
    "avatar_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "team_lead_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "projects_organization_id_name_key" ON "projects"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "projects_organization_id_idx" ON "projects"("organization_id");
CREATE INDEX IF NOT EXISTS "projects_team_lead_id_idx" ON "projects"("team_lead_id");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_team_lead_id_fkey"
  FOREIGN KEY ("team_lead_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Project Members
CREATE TABLE IF NOT EXISTS "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");
CREATE INDEX IF NOT EXISTS "project_members_user_id_idx" ON "project_members"("user_id");

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Add department/project fields to tasks
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "department_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "project_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "labels" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "description" TEXT;

CREATE INDEX IF NOT EXISTS "tasks_department_id_idx" ON "tasks"("department_id");
CREATE INDEX IF NOT EXISTS "tasks_project_id_idx" ON "tasks"("project_id");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Task-Department visibility (many-to-many)
CREATE TABLE IF NOT EXISTS "_TaskDepartmentVisibility" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "_TaskDepartmentVisibility_AB_unique" ON "_TaskDepartmentVisibility"("A", "B");
CREATE INDEX IF NOT EXISTS "_TaskDepartmentVisibility_B_index" ON "_TaskDepartmentVisibility"("B");

ALTER TABLE "_TaskDepartmentVisibility"
  ADD CONSTRAINT "_TaskDepartmentVisibility_A_fkey"
  FOREIGN KEY ("A") REFERENCES "departments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_TaskDepartmentVisibility"
  ADD CONSTRAINT "_TaskDepartmentVisibility_B_fkey"
  FOREIGN KEY ("B") REFERENCES "tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Checklists
CREATE TABLE IF NOT EXISTS "checklists" (
    "id" TEXT NOT NULL,
    "task_id" TEXT,
    "project_id" TEXT,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "checklists_task_id_idx" ON "checklists"("task_id");
CREATE INDEX IF NOT EXISTS "checklists_project_id_idx" ON "checklists"("project_id");

ALTER TABLE "checklists"
  ADD CONSTRAINT "checklists_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checklists"
  ADD CONSTRAINT "checklists_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Checklist Items
CREATE TABLE IF NOT EXISTS "checklist_items" (
    "id" TEXT NOT NULL,
    "checklist_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "assignee_id" TEXT,
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "checklist_items_checklist_id_idx" ON "checklist_items"("checklist_id");
CREATE INDEX IF NOT EXISTS "checklist_items_assignee_id_idx" ON "checklist_items"("assignee_id");

ALTER TABLE "checklist_items"
  ADD CONSTRAINT "checklist_items_checklist_id_fkey"
  FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
