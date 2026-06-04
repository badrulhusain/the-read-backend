-- CreateTable: Category
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Tag
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BlogTag
CREATE TABLE "BlogTag" (
    "blogId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "BlogTag_pkey" PRIMARY KEY ("blogId","tagId")
);

-- AlterTable: Blog new columns
ALTER TABLE "Blog"
    ADD COLUMN "categoryId" TEXT,
    ADD COLUMN "wordCount" INTEGER,
    ADD COLUMN "readingTime" INTEGER,
    ADD COLUMN "seoTitle" TEXT,
    ADD COLUMN "seoDescription" TEXT;

-- CreateUniqueIndex: Category
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateUniqueIndex: Tag
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");
CREATE INDEX "Tag_slug_idx" ON "Tag"("slug");

-- CreateIndex: BlogTag
CREATE INDEX "BlogTag_tagId_idx" ON "BlogTag"("tagId");

-- CreateIndex: Blog.categoryId
CREATE INDEX "Blog_categoryId_idx" ON "Blog"("categoryId");

-- AddForeignKey: Blog -> Category
ALTER TABLE "Blog" ADD CONSTRAINT "Blog_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: BlogTag -> Blog
ALTER TABLE "BlogTag" ADD CONSTRAINT "BlogTag_blogId_fkey"
    FOREIGN KEY ("blogId") REFERENCES "Blog"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: BlogTag -> Tag
ALTER TABLE "BlogTag" ADD CONSTRAINT "BlogTag_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "Tag"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
