-- Replace the legacy author submission lifecycle with the editorial lifecycle.
CREATE TYPE "GrammarStatus" AS ENUM ('NOT_REVIEWED', 'PASSED', 'NEEDS_CORRECTION');
CREATE TYPE "SourceVerificationStatus" AS ENUM ('NOT_REVIEWED', 'IN_PROGRESS', 'VERIFIED', 'NEEDS_CORRECTION', 'FAILED');
CREATE TYPE "EditorRecommendation" AS ENUM ('NEEDS_CORRECTION', 'READY_FOR_ADMIN', 'REJECT');

ALTER TABLE "Blog" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "BlogStatus_new" AS ENUM ('DRAFT', 'EDITING', 'QUALITY_REVIEW', 'NEEDS_CORRECTION', 'READY_FOR_ADMIN', 'SCHEDULED', 'PUBLISHED', 'REJECTED', 'UNPUBLISHED', 'ARCHIVED');
ALTER TABLE "Blog" ALTER COLUMN "status" TYPE "BlogStatus_new" USING (
  CASE "status"::text
    WHEN 'SUBMITTED' THEN 'EDITING'
    WHEN 'UNDER_REVIEW' THEN 'QUALITY_REVIEW'
    WHEN 'REVISION_REQUESTED' THEN 'NEEDS_CORRECTION'
    WHEN 'APPROVED' THEN 'READY_FOR_ADMIN'
    ELSE "status"::text
  END::"BlogStatus_new"
);
ALTER TYPE "BlogStatus" RENAME TO "BlogStatus_old";
ALTER TYPE "BlogStatus_new" RENAME TO "BlogStatus";
DROP TYPE "BlogStatus_old";
ALTER TABLE "Blog" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "Blog"
  ADD COLUMN "contributorId" TEXT,
  ADD COLUMN "lastAutosavedAt" TIMESTAMP(3);

ALTER TABLE "EditorialReview"
  ALTER COLUMN "submissionId" DROP NOT NULL,
  ALTER COLUMN "decision" DROP NOT NULL,
  ALTER COLUMN "factCheckStatus" DROP NOT NULL,
  ALTER COLUMN "checklist" DROP NOT NULL,
  ADD COLUMN "blogId" TEXT,
  ADD COLUMN "contentQualityScore" INTEGER,
  ADD COLUMN "grammarStatus" "GrammarStatus",
  ADD COLUMN "readabilityScore" INTEGER,
  ADD COLUMN "sourceVerificationStatus" "SourceVerificationStatus",
  ADD COLUMN "headlineQuality" INTEGER,
  ADD COLUMN "introductionQuality" INTEGER,
  ADD COLUMN "structureQuality" INTEGER,
  ADD COLUMN "conclusionQuality" INTEGER,
  ADD COLUMN "seoReadiness" INTEGER,
  ADD COLUMN "thumbnailQuality" INTEGER,
  ADD COLUMN "copyrightConfirmed" BOOLEAN,
  ADD COLUMN "recommendation" "EditorRecommendation",
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "requiredCorrections" JSONB;

ALTER TABLE "BlogVersion"
  ADD COLUMN "status" "BlogStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "wordCount" INTEGER,
  ADD COLUMN "readingTime" INTEGER;
ALTER TABLE "BlogVersion" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "SourceReference"
  ADD COLUMN "verificationStatus" "SourceVerificationStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
  ADD COLUMN "verifiedById" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SourceReference" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "Thumbnail" (
  "id" TEXT NOT NULL,
  "blogId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "altText" TEXT NOT NULL,
  "caption" TEXT,
  "crop" JSONB,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "size" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Thumbnail_pkey" PRIMARY KEY ("id")
);

-- Article documents are deliberately unsupported; content is stored as sanitized HTML.
DROP TABLE IF EXISTS "SubmissionAttachment";

CREATE INDEX "Blog_contributorId_createdAt_idx" ON "Blog"("contributorId", "createdAt");
CREATE INDEX "EditorialReview_blogId_createdAt_idx" ON "EditorialReview"("blogId", "createdAt");
CREATE INDEX "SourceReference_verifiedById_verifiedAt_idx" ON "SourceReference"("verifiedById", "verifiedAt");
CREATE UNIQUE INDEX "Thumbnail_blogId_key" ON "Thumbnail"("blogId");
CREATE UNIQUE INDEX "Thumbnail_publicId_key" ON "Thumbnail"("publicId");
CREATE INDEX "Thumbnail_uploadedById_createdAt_idx" ON "Thumbnail"("uploadedById", "createdAt");

ALTER TABLE "Blog" ADD CONSTRAINT "Blog_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialReview" ADD CONSTRAINT "EditorialReview_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Thumbnail" ADD CONSTRAINT "Thumbnail_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thumbnail" ADD CONSTRAINT "Thumbnail_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialReview" ADD CONSTRAINT "EditorialReview_scores_check" CHECK (
  ("contentQualityScore" IS NULL OR "contentQualityScore" BETWEEN 0 AND 100) AND
  ("readabilityScore" IS NULL OR "readabilityScore" BETWEEN 0 AND 100) AND
  ("headlineQuality" IS NULL OR "headlineQuality" BETWEEN 0 AND 100) AND
  ("introductionQuality" IS NULL OR "introductionQuality" BETWEEN 0 AND 100) AND
  ("structureQuality" IS NULL OR "structureQuality" BETWEEN 0 AND 100) AND
  ("conclusionQuality" IS NULL OR "conclusionQuality" BETWEEN 0 AND 100) AND
  ("seoReadiness" IS NULL OR "seoReadiness" BETWEEN 0 AND 100) AND
  ("thumbnailQuality" IS NULL OR "thumbnailQuality" BETWEEN 0 AND 100) AND
  ("plagiarismScore" IS NULL OR "plagiarismScore" BETWEEN 0 AND 100)
);
