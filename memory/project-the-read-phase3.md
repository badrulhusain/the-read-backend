---
name: project-the-read-phase3
description: Phase 3 Editorial Quality System implementation details for The Read backend (completed 2026-06-04)
metadata:
  type: project
---

Phase 3 was implemented on 2026-06-04 by adding the editorial quality system on top of Phase 1+2.

**Why:** Make the editorial review process professional, traceable, and fast.

**How to apply:** When continuing Phase 3 or Phase 4 work, assume these features are live in the database and in code.

Key changes:
- `BlogReview` got three nullable columns: `plagiarismScore Int?`, `plagiarismNote String?`, `checklist Json?`
- Migration applied: `20260604000000_phase3_editorial_quality_system`
- New endpoints: `GET /api/blogs/:id/reviews`, `/versions`, `/timeline` (auth-gated, blog owner/editor/admin only)
- `approve` now blocks if `checklist.readyToPublish === false` (400); warns if `plagiarismScore > 30`
- `assertReviewer` returns 409 for already-processed blogs (APPROVED/REJECTED/PUBLISHED/UNPUBLISHED/ARCHIVED) and 400 for other wrong-status cases
- `submit` now logs `BLOG_RESUBMITTED` vs `BLOG_SUBMITTED` correctly
- `create` now logs `BLOG_CREATED` audit event (was missing in Phase 2)
- `pick`/`edit`/`approve`/`reject`/`requestRevision` all carry richer audit metadata

Migration note: Use `DIRECT_URL` (session-mode pooler, port 5432) for migrations — the transaction-mode pooler (port 6543, pgbouncer=true) hangs.
Run as: `DATABASE_URL="$(grep DIRECT_URL .env | cut -d'"' -f2)" npx prisma migrate dev --name <name>`

[[project-the-read-phase1]]
