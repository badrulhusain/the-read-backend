# Professional editorial workflow

## Roles and lifecycle

The only roles are `USER`, `EDITOR`, and `ADMIN`.

- `USER`: read published articles, comment, save, and report.
- `EDITOR`: create and autosave drafts, edit sanitized rich-text HTML, manage sources and thumbnails, perform critical evaluation, request corrections, and send an article to admin.
- `ADMIN`: all editorial capabilities plus approval, rejection, scheduling, publication, unpublication, and archival.

Article status flow:

`DRAFT → EDITING → QUALITY_REVIEW → NEEDS_CORRECTION | READY_FOR_ADMIN → SCHEDULED | PUBLISHED → UNPUBLISHED | ARCHIVED`

## Article APIs

All routes are prefixed with `/api` and require a bearer token unless marked public.

| Method | Route | Roles | Purpose |
|---|---|---|---|
| `POST` | `/blogs/drafts` | Editor, Admin | Create an incomplete draft |
| `POST` | `/submissions/:id/article` | Editor, Admin | Create an assigned `EDITING` article from contributor HTML |
| `POST` | `/blogs` | Editor, Admin | Create a complete draft |
| `PATCH` | `/blogs/:id/autosave` | Editor, Admin | Autosave without creating a version |
| `PATCH` | `/blogs/:id/content` | Editor, Admin | Sanitize HTML, recalculate stats, and snapshot the prior version |
| `PATCH` | `/blogs/:id` | Editor, Admin | Major update with version snapshot |
| `POST` | `/blogs/:id/submit` | Editor, Admin | Move a draft into quality review |
| `GET` | `/blogs/:id/preview` | Editor, Admin | Preview unpublished article data |
| `GET` | `/blogs/:id/versions` | Editor, Admin | Paginated version history |
| `GET` | `/blogs/:id/timeline` | Editor, Admin | Paginated audit timeline |

## Thumbnail APIs

Only JPG/JPEG, PNG, and WebP are accepted. Maximum size is 5 MB. Dimensions must be between `600×315` and `6000×6000` pixels.

| Method | Route | Body |
|---|---|---|
| `POST` | `/blogs/:id/thumbnail` | Multipart: `file`, required `altText`, optional `caption` |
| `PATCH` | `/blogs/:id/thumbnail` | JSON: `altText`, optional `caption`, optional `crop` |
| `DELETE` | `/blogs/:id/thumbnail` | None |

`Thumbnail` stores `url`, `publicId`, `altText`, `caption`, `crop`, `uploadedById`, dimensions, size, and MIME type. Replacements and deletions remove the old Cloudinary asset. Article documents and PDF uploads are not supported.

## Sources and critical evaluation

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/blogs/:id/sources` | Add a source |
| `GET` | `/blogs/:id/sources` | List sources and verification state |
| `PATCH` | `/blogs/:id/sources/:sourceId/verify` | Verify a source |
| `POST` | `/editorial/blogs/:id/evaluation` | Submit the complete critical scorecard |
| `POST` | `/editorial/blogs/:id/return-for-correction` | Return with required corrections |
| `POST` | `/editorial/blogs/:id/send-to-admin` | Hand off after a ready recommendation |

The evaluation validates all requested 0–100 scores plus grammar, plagiarism, fact checking, source verification, copyright, recommendation, internal notes, corrections, and final checklist.

## Administration

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/admin/blogs/:id/approve` | Record admin approval |
| `POST` | `/admin/blogs/:id/reject` | Reject with a reason |
| `POST` | `/admin/blogs/:id/schedule` | Schedule approved content |
| `POST` | `/admin/blogs/:id/publish` | Publish approved ready/scheduled content |
| `POST` | `/admin/blogs/:id/unpublish` | Unpublish |
| `POST` | `/admin/blogs/:id/archive` | Archive |
| `POST` | `/admin/publications/run-due` | Publish up to 100 due articles |

Workflow changes use Prisma transactions and write audit entries. Foreign keys and common status/time access paths are indexed by the workflow migrations.
