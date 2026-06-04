-- CreateEnum: CommentStatus
CREATE TYPE "CommentStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'DELETED', 'PENDING');

-- AlterTable: User - add avatar fields
ALTER TABLE "User"
    ADD COLUMN "avatarUrl" TEXT,
    ADD COLUMN "avatarPublicId" TEXT;

-- AlterTable: Blog - add coverImagePublicId
ALTER TABLE "Blog"
    ADD COLUMN "coverImagePublicId" TEXT;

-- AlterTable: Category - add description and isActive
ALTER TABLE "Category"
    ADD COLUMN "description" TEXT,
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Tag - add isActive
ALTER TABLE "Tag"
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: Comment
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: Comment -> Blog
ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_blogId_fkey"
    FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Comment -> User
ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: Category isActive
CREATE INDEX "Category_isActive_idx" ON "Category"("isActive");

-- CreateIndex: Tag isActive
CREATE INDEX "Tag_isActive_idx" ON "Tag"("isActive");

-- CreateIndex: Comment indexes
CREATE INDEX "Comment_blogId_idx" ON "Comment"("blogId");
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");
CREATE INDEX "Comment_status_idx" ON "Comment"("status");
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
