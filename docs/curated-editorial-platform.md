# Curated editorial platform API

All routes use the `/api` prefix. JWT authentication is required unless a route is marked public. Request bodies are validated with `class-validator`; unknown fields are rejected.

## Roles

- `USER`: read published articles, comment, save, report, and read notifications.
- `EDITOR`: all reader capabilities plus editorial article creation/editing and assigned-submission review.
- `ADMIN`: all editorial capabilities plus assignment, immediate publication, scheduling, unpublishing, and archiving.

`AUTHOR` no longer exists. The migration converts existing `AUTHOR` accounts to `EDITOR` before replacing the PostgreSQL enum.

## Submission workflow

`RECEIVED → TRIAGE → ASSIGNED → EDITING → QUALITY_REVIEW → READY_FOR_ADMIN → PUBLISHED`

`EDITING` and `QUALITY_REVIEW` can move to `NEEDS_RESPONSE`; triage/review can reject. Publication and archiving are admin-only. A successful `READY_FOR_ADMIN` review requires `factCheckStatus=PASSED` and creates the publishable `Blog` in the same transaction.

### Public intake

- `POST /submissions` — external contributor submission; no account/JWT required. Accepts sanitized HTML content only; document and PDF uploads are unsupported.

### Editorial submission APIs

- `GET /submissions?page=1&limit=20&status=RECEIVED`
- `GET /submissions/:id`
- `PATCH /submissions/:id/assignment` — admin; body `{ "editorId": "uuid" }`
- `PATCH /submissions/:id/status` — editor/admin; body `{ "status": "EDITING" }`
- `POST /submissions/:id/notes` — internal note
- `POST /submissions/:id/emails` — record contributor email history
- `POST /submissions/:id/reviews` — plagiarism/fact/checklist decision

Review example:

```json
{
  "decision": "READY_FOR_ADMIN",
  "plagiarismScore": 4.2,
  "factCheckStatus": "PASSED",
  "factCheckNotes": "Names, dates and primary sources verified.",
  "checklist": {
    "headline": true,
    "copyEdited": true,
    "sourcesVerified": true,
    "legalRiskReviewed": true
  }
}
```

### Admin publication APIs

- `POST /admin/blogs/:id/publish` — only a `READY_FOR_ADMIN` blog
- `POST /admin/blogs/:id/schedule` — body `{ "publishAt": "2026-07-13T09:00:00.000Z" }`
- `POST /admin/publications/run-due` — publish up to 100 due approved articles; intended for a trusted cron caller
- `POST /admin/blogs/:id/unpublish`
- `POST /admin/blogs/:id/archive`

Scheduling leaves the article in `READY_FOR_ADMIN` with `scheduledAt` set. The due-publication action therefore retains the invariant that the source state for publication is always `READY_FOR_ADMIN`.

## Reader APIs

- `POST|DELETE /me/saved-blogs/:blogId`
- `GET /me/saved-blogs?page=1&limit=20`
- `POST /me/reports/:blogId`
- `GET /me/notifications?page=1&limit=20`
- `PATCH /me/notifications/:id/read`

## Migration and deployment

Run `npx prisma migrate deploy`, then `npm run seed`. Configure an authenticated scheduler to call `POST /api/admin/publications/run-due` at the desired interval. Existing category, tag, comment, SEO, Cloudinary, reading-time, audit, and blog-version data is retained.
