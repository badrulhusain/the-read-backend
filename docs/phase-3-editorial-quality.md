# Phase 3 - Editorial Quality System

Base URL: `http://localhost:4000/api`

All protected requests need `Authorization: Bearer <token>`.

## What Phase 3 Adds

Phase 3 makes the editorial workflow traceable and review-ready without adding uploads, Cloudinary, comments, likes, queues, Redis, or a real plagiarism API.

- Manual editorial review history.
- Blog version history for editor edits.
- Manual plagiarism score and note on reviews.
- Editorial checklist JSON on reviews.
- Revision feedback with structured checklist items.
- Blog timeline from audit logs.
- Admin visibility into latest review data before publishing.

## BlogReview Fields

New nullable fields:

- `plagiarismScore Int?` - manual score from 0 to 100.
- `plagiarismNote String?` - optional editorial note.
- `checklist Json?` - optional checklist and revision data.

Checklist shape:

```json
{
  "originalContent": true,
  "goodTitle": true,
  "clearIntroduction": true,
  "properLanguage": true,
  "safeContent": true,
  "readyToPublish": true
}
```

Revision checklist shape:

```json
{
  "originalContent": true,
  "goodTitle": false,
  "clearIntroduction": false,
  "properLanguage": true,
  "safeContent": true,
  "readyToPublish": false,
  "revisionItems": [
    {
      "section": "introduction",
      "note": "Make the introduction clearer."
    }
  ]
}
```

## Endpoints

Updated editorial endpoints:

- `POST /editorial/blogs/:id/approve`
- `POST /editorial/blogs/:id/reject`
- `POST /editorial/blogs/:id/request-revision`

New private blog endpoints:

- `GET /blogs/:id/reviews?page=1&limit=20`
- `GET /blogs/:id/versions?page=1&limit=20`
- `GET /blogs/:id/timeline?page=1&limit=50`

Access is limited to the blog owner, assigned editor, and admin.

## Example Requests

Approve:

```json
{
  "comment": "Ready to publish",
  "plagiarismScore": 8,
  "plagiarismNote": "No serious issue found.",
  "checklist": {
    "originalContent": true,
    "goodTitle": true,
    "clearIntroduction": true,
    "properLanguage": true,
    "safeContent": true,
    "readyToPublish": true
  }
}
```

Revision:

```json
{
  "comment": "Please improve introduction and sources.",
  "plagiarismScore": 25,
  "plagiarismNote": "Some common phrases found.",
  "checklist": {
    "originalContent": true,
    "goodTitle": false,
    "clearIntroduction": false,
    "properLanguage": true,
    "safeContent": true,
    "readyToPublish": false,
    "revisionItems": [
      {
        "section": "introduction",
        "note": "Make the introduction clearer."
      }
    ]
  }
}
```

Reject:

```json
{
  "comment": "This article cannot be accepted in its current form.",
  "plagiarismScore": 45,
  "plagiarismNote": "Large sections need originality review.",
  "checklist": {
    "originalContent": false,
    "safeContent": true,
    "readyToPublish": false
  }
}
```

## Rules

- Reject and request revision require a non-empty `comment`.
- Approve accepts an optional `comment`.
- `plagiarismScore` must be an integer between 0 and 100.
- Approval is blocked with `400` when `checklist.readyToPublish === false`.
- A plagiarism score above 30 does not block approval, but the response includes a warning and the score is saved in audit metadata.
- Reviewing a blog outside `UNDER_REVIEW` returns `400` or `409`, depending on whether it is an invalid transition or already processed.

## Expected Status Transitions

- `DRAFT` -> `SUBMITTED`
- `REVISION_REQUESTED` -> `SUBMITTED`
- `SUBMITTED` -> `UNDER_REVIEW`
- `UNDER_REVIEW` -> `APPROVED`
- `UNDER_REVIEW` -> `REJECTED`
- `UNDER_REVIEW` -> `REVISION_REQUESTED`
- `APPROVED` -> `PUBLISHED`
- `PUBLISHED` -> `UNPUBLISHED`

## Manual Test Flow

1. Register or log in as a user.
2. Create a blog: `POST /blogs`.
3. Submit it: `POST /blogs/:id/submit`.
4. Log in as an editor or admin.
5. Pick it: `POST /editorial/blogs/:id/pick`.
6. Optionally edit it: `PATCH /editorial/blogs/:id/edit`.
7. Approve, reject, or request revision with the Phase 3 payloads above.
8. Check review history: `GET /blogs/:id/reviews`.
9. Check version history: `GET /blogs/:id/versions`.
10. Check audit timeline: `GET /blogs/:id/timeline`.
11. If approved, log in as admin and publish: `POST /admin/blogs/:id/publish`.
