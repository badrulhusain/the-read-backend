ALTER TABLE "BlogReview"
ADD COLUMN "plagiarismScore" INTEGER,
ADD COLUMN "plagiarismNote" TEXT,
ADD COLUMN "checklist" JSONB;

ALTER TABLE "BlogReview"
ADD CONSTRAINT "BlogReview_plagiarismScore_check"
CHECK (
  "plagiarismScore" IS NULL
  OR ("plagiarismScore" >= 0 AND "plagiarismScore" <= 100)
);
