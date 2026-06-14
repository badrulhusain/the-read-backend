-- Add soft-delete state for users.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_isDeleted_idx" ON "User"("isDeleted");

-- Store editor/admin-managed cover image presentation metadata while keeping
-- the existing coverImage URL column for backwards compatibility.
ALTER TABLE "Blog"
  ADD COLUMN IF NOT EXISTS "coverImageAltText" TEXT,
  ADD COLUMN IF NOT EXISTS "coverImageCrop" JSONB,
  ADD COLUMN IF NOT EXISTS "coverImageUploadedById" TEXT;
