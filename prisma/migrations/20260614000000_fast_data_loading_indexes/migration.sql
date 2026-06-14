-- Add compound indexes for the read-heavy list, dashboard, and history queries.
CREATE INDEX IF NOT EXISTS "Blog_status_publishedAt_idx"
  ON "Blog"("status", "publishedAt");

CREATE INDEX IF NOT EXISTS "Blog_status_createdAt_idx"
  ON "Blog"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Blog_status_updatedAt_idx"
  ON "Blog"("status", "updatedAt");

CREATE INDEX IF NOT EXISTS "Blog_authorId_createdAt_idx"
  ON "Blog"("authorId", "createdAt");

CREATE INDEX IF NOT EXISTS "Blog_authorId_updatedAt_idx"
  ON "Blog"("authorId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Blog_assignedEditorId_status_updatedAt_idx"
  ON "Blog"("assignedEditorId", "status", "updatedAt");

CREATE INDEX IF NOT EXISTS "Blog_categoryId_status_publishedAt_idx"
  ON "Blog"("categoryId", "status", "publishedAt");

CREATE INDEX IF NOT EXISTS "Comment_blogId_status_createdAt_idx"
  ON "Comment"("blogId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "BlogReview_blogId_createdAt_idx"
  ON "BlogReview"("blogId", "createdAt");

CREATE INDEX IF NOT EXISTS "BlogReview_editorId_decision_idx"
  ON "BlogReview"("editorId", "decision");

CREATE INDEX IF NOT EXISTS "BlogVersion_blogId_versionNumber_idx"
  ON "BlogVersion"("blogId", "versionNumber");

CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_createdAt_idx"
  ON "AuditLog"("entityType", "entityId", "createdAt");
