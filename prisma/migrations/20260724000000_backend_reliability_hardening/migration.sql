-- Version-bound approvals and optimistic concurrency.
ALTER TABLE "Blog"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "approvedRevision" INTEGER,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "reactionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trendingScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Blog"
  ADD CONSTRAINT "Blog_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Blog_status_approvedRevision_scheduledAt_idx"
  ON "Blog"("status", "approvedRevision", "scheduledAt");

UPDATE "Blog" AS blog
SET "revision" = version_totals.next_revision
FROM (
  SELECT "blogId", COALESCE(MAX("versionNumber"), 0) + 1 AS next_revision
  FROM "BlogVersion"
  GROUP BY "blogId"
) AS version_totals
WHERE blog.id = version_totals."blogId";
CREATE INDEX "Blog_status_trendingScore_publishedAt_idx"
  ON "Blog"("status", "trendingScore", "publishedAt");

UPDATE "Blog" AS blog
SET
  "reactionCount" = reaction_totals.count,
  "trendingScore" = reaction_totals.count
FROM (
  SELECT "blogId", COUNT(*)::INTEGER AS count
  FROM "BlogReaction"
  GROUP BY "blogId"
) AS reaction_totals
WHERE blog.id = reaction_totals."blogId";

ALTER TABLE "EditorialReview" ADD COLUMN "blogRevision" INTEGER;
CREATE INDEX "EditorialReview_blogId_blogRevision_createdAt_idx"
  ON "EditorialReview"("blogId", "blogRevision", "createdAt");

-- Durable, idempotent best-effort Cloudinary cleanup.
CREATE TABLE "MediaCleanupJob" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaCleanupJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaCleanupJob_publicId_key"
  ON "MediaCleanupJob"("publicId");
CREATE INDEX "MediaCleanupJob_completedAt_availableAt_idx"
  ON "MediaCleanupJob"("completedAt", "availableAt");

-- Indexed case-insensitive substring search for public/editorial lists.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX "Blog_title_trgm_idx"
  ON "Blog" USING GIN ("title" extensions.gin_trgm_ops);
CREATE INDEX "Blog_excerpt_trgm_idx"
  ON "Blog" USING GIN ("excerpt" extensions.gin_trgm_ops);

-- NestJS is the only public data/auth source. Data API roles get no direct table
-- privileges; RLS remains defense in depth for every application table.
ALTER TABLE "MediaCleanupJob" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MediaCleanupJob" FROM anon, authenticated;

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.tablename);
  END LOOP;
END
$$;
