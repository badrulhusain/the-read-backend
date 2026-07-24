# Backend reliability hardening

## Canonical article state machine

Invalid transitions return HTTP `409`.

| Current | Allowed next states |
|---|---|
| `DRAFT` | `QUALITY_REVIEW`, `ARCHIVED` |
| `EDITING` | `QUALITY_REVIEW`, `ARCHIVED` |
| `QUALITY_REVIEW` | `NEEDS_CORRECTION`, `READY_FOR_ADMIN`, `REJECTED`, `ARCHIVED` |
| `NEEDS_CORRECTION` | `QUALITY_REVIEW`, `ARCHIVED` |
| `READY_FOR_ADMIN` | `SCHEDULED`, `PUBLISHED`, `NEEDS_CORRECTION`, `REJECTED`, `ARCHIVED` |
| `SCHEDULED` | `PUBLISHED`, `NEEDS_CORRECTION`, `ARCHIVED` |
| `PUBLISHED` | `UNPUBLISHED`, `ARCHIVED` |
| `UNPUBLISHED` | `ARCHIVED` |
| `REJECTED` | `ARCHIVED` |
| `ARCHIVED` | none |

Editors may edit only `DRAFT`, `EDITING`, `QUALITY_REVIEW`, and
`NEEDS_CORRECTION`. Admins cannot use generic edit APIs to change terminal or
publication states.

## Optimistic concurrency and approvals

`Blog.revision` is returned with private article responses. The following
content-write requests now require the last observed positive integer
`revision`:

- `PATCH /api/blogs/:id`
- `PATCH /api/blogs/:id/autosave`
- `PATCH /api/blogs/:id/content`
- `PATCH /api/editorial/blogs/:id/edit`

A stale value returns `409`, preventing two browser tabs from silently
overwriting each other. Successful edits increment the revision and clear
current admin approval.

Critical editorial evaluations store the article revision they reviewed.
Admin approval stores `approvedRevision`, `approvedAt`, and `approvedById` on
the article. Publishing and scheduling require that `approvedRevision` still
equals `revision`; audit history is never used as current approval state.

Version list responses no longer include `content`. Fetch one version's full
content with `GET /api/blogs/:id/versions/:versionId`.

New registrations and staff accounts require passwords between 12 and 72
characters. Existing password hashes remain valid for login.

## Scheduled publication and media cleanup

The application runs the due-publication worker every minute. Claims use the
current status, revision, and approval revision, so overlapping instances and
manual publish requests are safe. Each due article is isolated; one failure
does not stop the remainder.

Cloudinary deletion happens after authoritative database changes. Failures are
upserted by public ID into `MediaCleanupJob`; an idempotent worker retries due
jobs every five minutes with bounded exponential backoff.

Trending lists order by the stored `Blog.trendingScore` instead of sorting a
reaction relation at read time. Reaction inserts atomically increment the
stored counter, and the migration backfills existing reaction totals.

## Cache and observability policy

Public article and comment responses use `no-store`, guaranteeing that an
unpublished article is not retained by compliant browser or intermediary
caches. Taxonomy responses retain a bounded public cache because they contain
no article visibility state. Authenticated/editorial responses are not
publicly cacheable.

Every HTTP response has an `x-request-id`; structured logs record request ID,
method, path without query parameters, status, and duration. Database
operations taking at least 500 ms emit timing-only warnings. Request bodies,
query values, cookies, tokens, and Prisma parameters are not logged.

## Deployment

1. Use the Supabase pooled runtime URL for `DATABASE_URL` and the direct
   session connection for `DIRECT_URL`.
2. Run `npx prisma migrate deploy`, then `npx prisma generate`.
3. Ensure the database role used by NestJS is trusted and can bypass the
   defense-in-depth RLS policies. `anon` and `authenticated` have no access to
   `MediaCleanupJob`.
4. Confirm the `pg_trgm` extension can be installed in the `extensions`
   schema.
5. Deploy at least one continuously running NestJS instance for the in-process
   minute scheduler. For scale-to-zero platforms, add a protected platform cron
   call to `POST /api/admin/publications/run-due` using an admin service
   identity.

The migration is
`20260724000000_backend_reliability_hardening`.
