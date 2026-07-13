# The Read — Backend API

NestJS, Prisma, and PostgreSQL backend for an editor-led publishing workflow.

## Workflow

External contributors submit HTML content without an account. Editors turn submissions into articles, edit and evaluate them, and send ready work to admins. Only admins approve, schedule, publish, unpublish, reject, or archive articles.

Roles are strictly `USER`, `EDITOR`, and `ADMIN`. Users can read published articles, comment, save, and report; they cannot create or edit articles.

Statuses:

`DRAFT`, `EDITING`, `QUALITY_REVIEW`, `NEEDS_CORRECTION`, `READY_FOR_ADMIN`, `SCHEDULED`, `PUBLISHED`, `REJECTED`, `UNPUBLISHED`, `ARCHIVED`.

Article content is sanitized HTML. The backend calculates word count and estimated reading time, creates version snapshots for major edits, and records workflow events in the audit timeline.

Only Cloudinary thumbnail uploads are supported: JPG/JPEG, PNG, or WebP, up to 5 MB and between 600×315 and 6000×6000 pixels. Article document and PDF uploads are not supported.

See [docs/professional-editorial-workflow.md](docs/professional-editorial-workflow.md) for current API contracts and [docs/curated-editorial-platform.md](docs/curated-editorial-platform.md) for migration context.

## Setup

```bash
npm install
npx prisma migrate deploy
npm run seed
npm run start:dev
```

Required environment variables:

```text
DATABASE_URL=
JWT_SECRET=
FRONTEND_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
ADMIN_NAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

The API uses the `/api` global prefix and defaults to port `4000`.

## Verification

```bash
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```
