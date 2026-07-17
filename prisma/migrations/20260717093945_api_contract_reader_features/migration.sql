CREATE TYPE "ReactionType" AS ENUM (
  'INSIGHTFUL',
  'INSPIRING',
  'THOUGHT_PROVOKING'
);

CREATE TABLE "ReadingHistory" (
  "userId" TEXT NOT NULL,
  "blogId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReadingHistory_pkey" PRIMARY KEY ("userId", "blogId"),
  CONSTRAINT "ReadingHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReadingHistory_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BlogReaction" (
  "userId" TEXT NOT NULL,
  "blogId" TEXT NOT NULL,
  "type" "ReactionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogReaction_pkey" PRIMARY KEY ("userId", "blogId", "type"),
  CONSTRAINT "BlogReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BlogReaction_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "NewsletterSubscriber" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");
CREATE INDEX "ReadingHistory_userId_lastReadAt_idx" ON "ReadingHistory"("userId", "lastReadAt");
CREATE INDEX "ReadingHistory_blogId_idx" ON "ReadingHistory"("blogId");
CREATE INDEX "BlogReaction_blogId_type_idx" ON "BlogReaction"("blogId", "type");
CREATE INDEX "BlogReaction_userId_createdAt_idx" ON "BlogReaction"("userId", "createdAt");
CREATE INDEX "NewsletterSubscriber_isActive_createdAt_idx" ON "NewsletterSubscriber"("isActive", "createdAt");

ALTER TABLE "ReadingHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlogReaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NewsletterSubscriber" ENABLE ROW LEVEL SECURITY;
