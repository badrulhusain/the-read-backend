# Final Phase — Production Readiness

## Overview

This phase adds:
- Comments system
- Cloudinary image upload
- Category/tag improvements (isActive, description, admin list, soft-delete)
- commentsCount + coverImagePublicId in blog responses
- avatarUrl / avatarPublicId on User
- Health check endpoint
- .env.example with Cloudinary keys

---

## Environment Variables Required

```env
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
FRONTEND_URL=http://localhost:5173
PORT=4000
```

---

## Migration

Run locally after pulling these changes:

```bash
npx prisma migrate dev --name final_phase_comments_tags_cloudinary
npx prisma generate
```

Or apply directly against remote DB:

```bash
npx prisma migrate deploy
npx prisma generate
```

The migration adds:
- `CommentStatus` enum (VISIBLE, HIDDEN, DELETED, PENDING)
- `Comment` table with blog/user FK, parentId, content, status
- `User.avatarUrl`, `User.avatarPublicId`
- `Blog.coverImagePublicId`
- `Category.description`, `Category.isActive`
- `Tag.isActive`
- Indexes on all new columns

---

## Cloudinary Setup

1. Create a free Cloudinary account at cloudinary.com
2. Copy Cloud Name, API Key, API Secret from dashboard
3. Add to `.env`:
   ```
   CLOUDINARY_CLOUD_NAME=xxx
   CLOUDINARY_API_KEY=xxx
   CLOUDINARY_API_SECRET=xxx
   ```
4. No Cloudinary SDK setup required — the backend handles all uploads

---

## Upload API

### POST /api/uploads/image

**Protected** — requires valid JWT.

Form-data fields:
- `file` — the image file
- `type` — `BLOG_COVER` or `PROFILE_IMAGE`

Limits:
- `BLOG_COVER`: max 5MB, transforms to 1200×630 fill
- `PROFILE_IMAGE`: max 2MB, transforms to 400×400 fill (gravity:face)

Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`

Response:
```json
{
  "url": "https://res.cloudinary.com/...",
  "publicId": "the-read/blog-covers/...",
  "width": 1200,
  "height": 630,
  "format": "webp",
  "bytes": 12345
}
```

Errors:
- `400` — missing file or invalid type/MIME
- `413` — file too large
- `403` — blocked user

After uploading, pass the `url` as `coverImage` and `publicId` as `coverImagePublicId` in blog create/update body.

---

## Comment API

### GET /api/blogs/:slug/comments?page=1&limit=10

**Public**. Only for published blogs. Returns only VISIBLE comments oldest-first.

Response:
```json
{
  "data": [
    {
      "id": "...",
      "content": "Great read!",
      "status": "VISIBLE",
      "parentId": null,
      "createdAt": "...",
      "updatedAt": "...",
      "user": { "id": "...", "name": "Alice", "avatarUrl": null }
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
}
```

### POST /api/blogs/:slug/comments

**Protected**. Body: `{ "content": "..." }`. Min 1, max 1500 chars. Returns created comment.

### DELETE /api/comments/:id

**Protected**. Owner can soft-delete own comment. Admin/Editor can delete any.

### PATCH /api/comments/:id/hide

**EDITOR or ADMIN**. Sets status to HIDDEN.

### PATCH /api/comments/:id/restore

**EDITOR or ADMIN**. Sets status back to VISIBLE.

### GET /api/admin/comments?page=1&limit=10&status=HIDDEN&search=text

**ADMIN only**. Lists all comments with blog title and user info.

### PATCH /api/admin/comments/:id/hide | /restore | /delete

**ADMIN only**. Moderates a comment.

---

## Category API (updated)

### GET /api/categories

Public. Returns only active categories with `id, name, slug, description`.

### GET /api/categories/admin

EDITOR or ADMIN. Returns all categories (active + inactive) with blog count.

### POST /api/categories

EDITOR or ADMIN. Body: `{ "name": "...", "description": "..." }`.

### PATCH /api/categories/:id

EDITOR or ADMIN. Body: `{ "name"?, "description"?, "isActive"? }`.
- Soft-disabling via `isActive: false` prevents public listing.
- Name/slug uniqueness enforced.

### DELETE /api/categories/:id

ADMIN only.
- If category has blogs → soft-disable (isActive=false) + return message.
- If no blogs → hard delete.

---

## Tag API (updated)

### GET /api/tags

Public. Returns only active tags.

### GET /api/tags/admin

EDITOR or ADMIN. Returns all tags with blog count.

### POST /api/tags

EDITOR or ADMIN. Body: `{ "name": "..." }`.

### PATCH /api/tags/:id

EDITOR or ADMIN. Body: `{ "name"?, "isActive"? }`.

### DELETE /api/tags/:id

ADMIN only.
- If tag used by blogs → soft-disable.
- If unused → hard delete.

---

## Blog Filter API

### GET /api/blogs?page=1&limit=10&search=...&category=slug&tag=slug

Public. Returns published blogs only.

Response includes per blog: `commentsCount` (via `_count.comments`).

### GET /api/blogs/:slug

Public. Returns full blog detail including `_count.comments`.

---

## Performance Improvements

- `_count.comments` is a single aggregated subquery — no N+1
- All list endpoints paginated with default=10, max=50
- `$transaction` used for parallel count+data queries
- Indexes on Comment (blogId, status, createdAt, userId, parentId)
- Indexes on Category.isActive, Tag.isActive
- Blog list select excludes `content` field
- Dashboard uses single `$transaction` for all counts

---

## Security

- Helmet enabled globally
- CORS restricted to `FRONTEND_URL`
- ValidationPipe with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- No `passwordHash` ever in responses
- Blocked users cannot post comments or upload images
- Cloudinary secret never exposed to client
- All uploads validated server-side (MIME, size, type)
- GlobalExceptionFilter prevents raw Prisma error leaks
- HTML sanitization via `sanitize-html` on blog content

---

## Manual Backend Test Flow

### 1. Health check
```
GET /api/health
→ { status: "ok", timestamp: "...", uptime: 0 }
```

### 2. Register + login
```
POST /api/auth/register { name, email, password }
POST /api/auth/login { email, password }
→ save access_token
```

### 3. Create category + tag (as ADMIN)
```
POST /api/categories { name: "Tech", description: "Technology posts" }
POST /api/tags { name: "JavaScript" }
```

### 4. Create + publish a blog
```
POST /api/blogs { title, content, categoryId, tagIds: [tagId] }
POST /api/blogs/:id/submit
POST /api/editorial/blogs/:id/pick (as EDITOR)
POST /api/editorial/blogs/:id/approve (as EDITOR)
POST /api/admin/blogs/:id/publish (as ADMIN)
```

### 5. Upload an image
```
POST /api/uploads/image (form-data: file + type=BLOG_COVER)
→ { url, publicId, width, height, format, bytes }
PATCH /api/blogs/:id { coverImage: url, coverImagePublicId: publicId }
```

### 6. Post + moderate a comment
```
POST /api/blogs/:slug/comments { content: "Great post!" }
GET /api/blogs/:slug/comments
PATCH /api/comments/:id/hide (as EDITOR/ADMIN)
PATCH /api/admin/comments/:id/restore (as ADMIN)
```

### 7. Verify commentsCount in blog detail
```
GET /api/blogs/:slug
→ _count.comments should match visible comments
```

### 8. Soft delete category with blogs
```
DELETE /api/categories/:id
→ { message: "Category deactivated (N blog(s) still assigned)" }
GET /api/categories → should not include the deactivated category
```

---

## Assumptions

- Comments do not support nested replies in the first pass (parentId stored but not queried recursively)
- Comment edit is not implemented (simpler to soft-delete + re-post)
- Rate limiting for comments is handled by the global throttler (100 req/min per IP)
- Cloudinary auto-converts to webp via `fetch_format: auto`
- `avatarUrl` / `avatarPublicId` are stored but profile update endpoint is not in scope (frontend can call upload then update user profile separately)
