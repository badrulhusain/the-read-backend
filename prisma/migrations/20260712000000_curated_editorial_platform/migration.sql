-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('RECEIVED', 'TRIAGE', 'ASSIGNED', 'EDITING', 'NEEDS_RESPONSE', 'QUALITY_REVIEW', 'READY_FOR_ADMIN', 'REJECTED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FactCheckStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'NEEDS_CHANGES', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SUBMISSION_UPDATE', 'EDITOR_ASSIGNED', 'REVIEW_COMPLETE', 'PUBLICATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED', 'ACTIONED');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('USER', 'EDITOR', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
-- Existing content creators become editorial staff before AUTHOR is removed.
UPDATE "User" SET "role" = 'EDITOR' WHERE "role" = 'AUTHOR';
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BlogStatus" ADD VALUE 'READY_FOR_ADMIN';
ALTER TYPE "BlogStatus" ADD VALUE 'SCHEDULED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReviewDecision" ADD VALUE 'NEEDS_RESPONSE';
ALTER TYPE "ReviewDecision" ADD VALUE 'READY_FOR_ADMIN';

-- DropIndex
DROP INDEX "User_email_idx";

-- DropIndex
DROP INDEX "User_role_idx";

-- DropIndex
DROP INDEX "User_status_idx";

-- DropIndex
DROP INDEX "Blog_slug_idx";

-- DropIndex
DROP INDEX "Blog_status_idx";

-- DropIndex
DROP INDEX "Blog_authorId_idx";

-- DropIndex
DROP INDEX "Blog_assignedEditorId_idx";

-- DropIndex
DROP INDEX "Blog_categoryId_idx";

-- DropIndex
DROP INDEX "Blog_publishedAt_idx";

-- DropIndex
DROP INDEX "Blog_createdAt_idx";

-- DropIndex
DROP INDEX "Blog_status_createdAt_idx";

-- DropIndex
DROP INDEX "Blog_status_updatedAt_idx";

-- DropIndex
DROP INDEX "Blog_authorId_updatedAt_idx";

-- DropIndex
DROP INDEX "Category_slug_idx";

-- DropIndex
DROP INDEX "Tag_slug_idx";

-- DropIndex
DROP INDEX "BlogReview_blogId_idx";

-- DropIndex
DROP INDEX "BlogReview_editorId_idx";

-- DropIndex
DROP INDEX "BlogReview_decision_idx";

-- DropIndex
DROP INDEX "BlogVersion_blogId_idx";

-- DropIndex
DROP INDEX "BlogVersion_editedById_idx";

-- DropIndex
DROP INDEX "BlogVersion_blogId_versionNumber_idx";

-- DropIndex
DROP INDEX "Comment_blogId_idx";

-- DropIndex
DROP INDEX "Comment_userId_idx";

-- DropIndex
DROP INDEX "Comment_status_idx";

-- DropIndex
DROP INDEX "Comment_createdAt_idx";

-- DropIndex
DROP INDEX "AuditLog_actorId_idx";

-- DropIndex
DROP INDEX "AuditLog_action_idx";

-- DropIndex
DROP INDEX "AuditLog_entityType_idx";

-- DropIndex
DROP INDEX "AuditLog_createdAt_idx";

-- AlterTable
ALTER TABLE "Blog" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "submissionId" TEXT;

-- AlterTable
ALTER TABLE "BlogVersion" ADD COLUMN     "changeNote" TEXT,
ADD COLUMN     "excerpt" TEXT,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT;

-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "bio" TEXT,
    "organization" TEXT,
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pitch" TEXT,
    "content" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "assignedEditorId" TEXT,
    "plagiarismScore" DECIMAL(5,2),
    "factCheckStatus" "FactCheckStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "editorialChecklist" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "summary" TEXT,
    "plagiarismScore" DECIMAL(5,2),
    "plagiarismNotes" TEXT,
    "factCheckStatus" "FactCheckStatus" NOT NULL,
    "factCheckNotes" TEXT,
    "checklist" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialNote" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionEmail" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,

    CONSTRAINT "SubmissionEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedBlog" (
    "userId" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedBlog_pkey" PRIMARY KEY ("userId","blogId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceReference" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publisher" TEXT,
    "accessedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogReport" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contributor_email_idx" ON "Contributor"("email");

-- CreateIndex
CREATE INDEX "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_assignedEditorId_status_updatedAt_idx" ON "Submission"("assignedEditorId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Submission_contributorId_createdAt_idx" ON "Submission"("contributorId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionAttachment_submissionId_createdAt_idx" ON "SubmissionAttachment"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "EditorialReview_submissionId_createdAt_idx" ON "EditorialReview"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "EditorialReview_editorId_createdAt_idx" ON "EditorialReview"("editorId", "createdAt");

-- CreateIndex
CREATE INDEX "EditorialReview_decision_createdAt_idx" ON "EditorialReview"("decision", "createdAt");

-- CreateIndex
CREATE INDEX "EditorialNote_submissionId_createdAt_idx" ON "EditorialNote"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionEmail_submissionId_sentAt_idx" ON "SubmissionEmail"("submissionId", "sentAt");

-- CreateIndex
CREATE INDEX "SavedBlog_blogId_idx" ON "SavedBlog"("blogId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "SourceReference_blogId_createdAt_idx" ON "SourceReference"("blogId", "createdAt");

-- CreateIndex
CREATE INDEX "BlogReport_blogId_status_createdAt_idx" ON "BlogReport"("blogId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BlogReport_userId_createdAt_idx" ON "BlogReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Blog_submissionId_key" ON "Blog"("submissionId");

-- CreateIndex
CREATE INDEX "Blog_status_scheduledAt_idx" ON "Blog"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Blog_createdById_updatedAt_idx" ON "Blog"("createdById", "updatedAt");

-- CreateIndex
CREATE INDEX "BlogVersion_editedById_createdAt_idx" ON "BlogVersion"("editedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlogVersion_blogId_versionNumber_key" ON "BlogVersion"("blogId", "versionNumber");

-- CreateIndex
CREATE INDEX "Comment_userId_createdAt_idx" ON "Comment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignedEditorId_fkey" FOREIGN KEY ("assignedEditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttachment" ADD CONSTRAINT "SubmissionAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialReview" ADD CONSTRAINT "EditorialReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialReview" ADD CONSTRAINT "EditorialReview_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialNote" ADD CONSTRAINT "EditorialNote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialNote" ADD CONSTRAINT "EditorialNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionEmail" ADD CONSTRAINT "SubmissionEmail_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blog" ADD CONSTRAINT "Blog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blog" ADD CONSTRAINT "Blog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedBlog" ADD CONSTRAINT "SavedBlog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedBlog" ADD CONSTRAINT "SavedBlog_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogReport" ADD CONSTRAINT "BlogReport_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogReport" ADD CONSTRAINT "BlogReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
