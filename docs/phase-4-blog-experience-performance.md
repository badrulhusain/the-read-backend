# Phase 4: Blog Experience + Performance Optimization

## Overview

Phase 4 adds rich text support, categories, tags, reading time, dashboard summary APIs, and landing-page-optimized public endpoints.

---

## New Dependencies

```
sanitize-html    ^2.x    HTML sanitization before DB write
@types/sanitize-html     TypeScript types
```

---

## Prisma Schema Changes

New models: `Category`, `Tag`, `BlogTag`.

New `Blog` fields:
- `categoryId String?` — FK to Category (SET NULL on delete)
- `tags BlogTag[]`
- `wordCount Int?`
- `readingTime Int?` (minutes)
- `seoTitle String?` (max 70 chars)
- `seoDescription String?` (max 160 chars)

New indexes: `Blog.categoryId`, `Category.slug`, `Tag.slug`, `BlogTag.tagId`.

Migration file: `prisma/migrations/20260604000001_phase4_blog_experience_performance/migration.sql`

---

## HTML Sanitization

File: `src/common/utils/sanitize-blog-html.ts`

Allowed tags: `p h1 h2 h3 h4 strong em u s blockquote ul ol li code pre a br hr`

Allowed attributes: `a[href, target, rel]`

Rules:
- `script`, `style`, `iframe` — stripped
- `onClick`, `onLoad`, event handlers — stripped
- `javascript:` links — stripped (only `http`, `https`, `mailto` schemes allowed)
- External links automatically get `target="_blank" rel="noopener noreferrer"`
- If sanitized content is empty string, API returns `400`

---

## Word Count & Reading Time

File: `src/common/utils/reading-time.ts`

- Strips all HTML tags first
- Counts space-separated words
- `readingTime = Math.max(1, Math.ceil(wordCount / 200))`
- Computed at write time (create, update, editor edit) — NOT on every read

---

## Dashboard APIs

### GET /api/dashboard/user
Auth: any ACTIVE authenticated user (USER / AUTHOR / EDITOR / ADMIN)

Response:
```json
{
  "stats": {
    "drafts": 0,
    "submitted": 0,
    "underReview": 0,
    "revisionRequested": 0,
    "approved": 0,
    "published": 0,
    "rejected": 0
  },
  "recentBlogs": [
    {
      "id": "...",
      "title": "...",
      "slug": "...",
      "excerpt": "...",
      "status": "DRAFT",
      "updatedAt": "...",
      "createdAt": "..."
    }
  ]
}
```

### GET /api/dashboard/editor
Auth: EDITOR or ADMIN only

Response:
```json
{
  "stats": {
    "submittedQueue": 0,
    "assignedToMe": 0,
    "approvedByMe": 0,
    "rejectedByMe": 0,
    "revisionRequestedByMe": 0
  },
  "recentAssigned": [
    {
      "id": "...",
      "title": "...",
      "slug": "...",
      "status": "UNDER_REVIEW",
      "updatedAt": "...",
      "author": { "id": "...", "name": "..." }
    }
  ]
}
```

### GET /api/dashboard/admin
Auth: ADMIN only

Response:
```json
{
  "stats": {
    "users": 0,
    "authors": 0,
    "editors": 0,
    "admins": 0,
    "totalBlogs": 0,
    "submitted": 0,
    "underReview": 0,
    "approved": 0,
    "published": 0,
    "rejected": 0
  },
  "recentBlogs": [...],
  "recentActivity": [
    {
      "id": "...",
      "action": "BLOG_SUBMITTED",
      "entityType": "Blog",
      "entityId": "...",
      "createdAt": "...",
      "actor": { "id": "...", "name": "...", "role": "USER" }
    }
  ]
}
```

Performance: all counts use `prisma.$transaction` with `prisma.*.count()` — no JS-side counting.

---

## Category APIs

### GET /api/categories
Public. Returns `[{ id, name, slug }]` ordered by name asc.

### POST /api/categories
ADMIN only. Body: `{ "name": "Technology" }`. Auto-generates slug. Returns 409 on duplicate.

### PATCH /api/categories/:id
ADMIN only. Body: `{ "name": "New Name" }`. Regenerates slug. Returns 409 on duplicate.

### DELETE /api/categories/:id
ADMIN only. Returns 409 if any blogs are assigned to the category (safe delete).

---

## Tag APIs

### GET /api/tags
Public. Returns `[{ id, name, slug }]` ordered by name asc.

### POST /api/tags
EDITOR or ADMIN only. Body: `{ "name": "javascript" }`. Auto-generates slug. Returns 409 on duplicate.

Users/Authors can only select existing tags via `tagIds` on blog create/update.

---

## Blog Create/Update Payload

### POST /api/blogs
```json
{
  "title": "My First Rich Blog",
  "excerpt": "A short summary",
  "content": "<h2>Introduction</h2><p>This is <strong>rich</strong> content.</p>",
  "coverImage": "https://example.com/image.jpg",
  "categoryId": "uuid-of-category",
  "tagIds": ["uuid-tag-1", "uuid-tag-2"],
  "seoTitle": "My First Rich Blog",
  "seoDescription": "A short SEO description"
}
```

### PATCH /api/blogs/:id
All fields optional. If `tagIds` is provided, existing tags are replaced entirely in a transaction.

Validation rules:
- `title`: 3–255 chars
- `content`: min 10 chars; sanitized content must not be empty
- `excerpt`: max 500 chars
- `categoryId`: must exist in Category table
- `tagIds`: each must be valid tag UUID; max 5 tags
- `seoTitle`: max 70 chars
- `seoDescription`: max 160 chars
- `coverImage`: URL string only — no file upload

---

## Public Blog List API (Landing Page)

### GET /api/blogs
Public. Query params: `page`, `limit` (max 50), `search`, `category` (slug), `tag` (slug).

Returns only `PUBLISHED` blogs. Ordered by `publishedAt desc`.

Response fields per blog: `id title slug excerpt coverImage publishedAt readingTime wordCount author category tags`

No `content`, no `reviews`, no `passwordHash`.

Frontend landing page tip: `GET /api/blogs?limit=6` — use first item as featured blog.

### GET /api/blogs/:slug
Returns full blog detail for PUBLISHED blogs only. Returns 404 for any other status.

Extra fields: `content seoTitle seoDescription`

### GET /api/blogs/:slug/related
Returns up to 3 related published blogs by same category. Lightweight fields only (no content).

---

## Admin Blog List Improvements

### GET /api/admin/blogs
Supports: `page limit search status categoryId`

List returns: `id title slug status publishedAt readingTime createdAt updatedAt author assignedEditor category`

No full content in list. No reviews nested (kept clean).

---

## Performance Rules Applied

- All list endpoints use `prisma.$transaction([findMany, count])` — single round trip
- All selects use explicit `select: {}` — no over-fetching
- `passwordHash` never returned anywhere
- Dashboard counts run in parallel transactions
- `readingTime` / `wordCount` stored at write time
- Related blogs use DB-side filter (`categoryId`) — no JS filtering
- Tags returned via join select — no N+1

---

## Manual Backend Test Flow

```
# 1. Register + login as ADMIN, USER, EDITOR

POST /api/auth/register   { name, email, password }
POST /api/auth/login      { email, password }

# 2. Admin creates categories and tags

POST /api/categories      { name: "Technology" }          → returns { id, name, slug }
POST /api/categories      { name: "Lifestyle" }
POST /api/tags            { name: "javascript" }          → EDITOR/ADMIN only
POST /api/tags            { name: "tutorial" }

# 3. List categories and tags (public)

GET /api/categories
GET /api/tags

# 4. Create blog with rich content (as author/user)

POST /api/blogs
{
  "title": "Rich Blog Test",
  "excerpt": "A test",
  "content": "<h2>Hello</h2><p>This is <strong>rich</strong> text.</p>",
  "categoryId": "<category-id>",
  "tagIds": ["<tag-id>"],
  "seoTitle": "Rich Blog Test",
  "seoDescription": "A test blog"
}
→ Check wordCount and readingTime in response

# 5. Verify sanitization rejects XSS

POST /api/blogs
{ "title": "XSS Test", "content": "<script>alert('xss')</script><p>Safe</p>" }
→ script tag stripped, only <p>Safe</p> stored

# 6. Submit → pick → approve → publish workflow (same as Phase 2/3)

# 7. Check public blog list

GET /api/blogs
GET /api/blogs?category=technology
GET /api/blogs?tag=javascript
GET /api/blogs?search=rich

# 8. Check blog detail and related

GET /api/blogs/<slug>
GET /api/blogs/<slug>/related

# 9. Check dashboards

GET /api/dashboard/user        → requires any authenticated user
GET /api/dashboard/editor      → requires EDITOR/ADMIN
GET /api/dashboard/admin       → requires ADMIN

# 10. Admin blog list with filters

GET /api/admin/blogs?status=PUBLISHED
GET /api/admin/blogs?categoryId=<id>

# 11. Delete category (should fail if blogs exist)

DELETE /api/categories/<id>    → 409 if blogs assigned

# 12. Attempt empty content after sanitization

POST /api/blogs { "title": "Bad", "content": "<script>bad</script>" }
→ 400 "Blog content is empty after sanitization"
```

---

## Commands to Run

```bash
# After pulling this branch
npm install

# Regenerate Prisma client
npx prisma generate

# Run migration against Supabase (requires DATABASE_URL in .env)
npx prisma migrate deploy

# Or for local dev with migration history tracking
npx prisma migrate dev --name phase4_blog_experience_performance

# Build
npm run build

# Start dev server
npm run start:dev
```
