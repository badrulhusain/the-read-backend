# Phase 2 — Manual API Verification Guide

Base URL: `http://localhost:4000/api`

All protected requests need: `Authorization: Bearer <token>`

---

## Step 1 — Seed Admin

Run once to create the admin account:

```bash
npm run seed
```

Admin credentials (from `.env`):
- Email: `admin@theread.com`
- Password: `AdminPass123`

---

## Step 2 — Admin Login

```
POST /api/auth/login
{
  "email": "admin@theread.com",
  "password": "AdminPass123"
}
```

Expected: `200 OK` with `{ user: { role: "ADMIN", status: "ACTIVE" }, access_token: "..." }`

Save `access_token` as `$ADMIN_TOKEN`.

---

## Step 3 — Admin Creates Editor

```
POST /api/admin/editors
Authorization: Bearer $ADMIN_TOKEN
{
  "name": "Jane Editor",
  "email": "editor@theread.com",
  "password": "EditorPass123"
}
```

Expected: `201 Created` with `{ role: "EDITOR", status: "ACTIVE" }`

---

## Step 4 — User Registers

```
POST /api/auth/register
{
  "name": "Bob Author",
  "email": "bob@example.com",
  "password": "BobPass123"
}
```

Expected: `201 Created` with `{ user: { role: "USER" }, access_token: "..." }`

---

## Step 5 — User Login

```
POST /api/auth/login
{
  "email": "bob@example.com",
  "password": "BobPass123"
}
```

Save `access_token` as `$USER_TOKEN`.

---

## Step 6 — User Creates Draft Blog

```
POST /api/blogs
Authorization: Bearer $USER_TOKEN
{
  "title": "My First Blog Post",
  "content": "This is the full content of my blog post. It has enough characters to pass validation."
}
```

Expected: `201 Created` with `{ status: "DRAFT", slug: "my-first-blog-post" }`

Save `id` as `$BLOG_ID`.

---

## Step 7 — User Submits Blog

```
POST /api/blogs/$BLOG_ID/submit
Authorization: Bearer $USER_TOKEN
```

Expected: `201 Created` with `{ status: "SUBMITTED", assignedEditorId: null }`

---

## Step 8 — Editor Login

```
POST /api/auth/login
{
  "email": "editor@theread.com",
  "password": "EditorPass123"
}
```

Expected: `200 OK` with `{ user: { role: "EDITOR", status: "ACTIVE" }, access_token: "..." }`

Save `access_token` as `$EDITOR_TOKEN`.

---

## Step 9 — Editor Lists Submissions

```
GET /api/editorial/submissions?page=1&limit=10
Authorization: Bearer $EDITOR_TOKEN
```

Expected: `200 OK` with paginated list including the submitted blog.
`data[0].status` should be `"SUBMITTED"`.

---

## Step 10 — Editor Picks Blog

```
POST /api/editorial/blogs/$BLOG_ID/pick
Authorization: Bearer $EDITOR_TOKEN
```

Expected: `201 Created` with `{ status: "UNDER_REVIEW", assignedEditorId: "<editor-id>" }`

---

## Step 11 — Editor Edits Blog (Optional)

```
PATCH /api/editorial/blogs/$BLOG_ID/edit
Authorization: Bearer $EDITOR_TOKEN
{
  "title": "My First Blog Post (Edited)",
  "excerpt": "A short summary of the blog."
}
```

Expected: `200 OK` with updated blog. Old version saved to `BlogVersion`.

---

## Step 12a — Editor Approves Blog

```
POST /api/editorial/blogs/$BLOG_ID/approve
Authorization: Bearer $EDITOR_TOKEN
{
  "comment": "Great post, approved."
}
```

Expected: `201 Created` with `{ status: "APPROVED" }`

---

## Step 12b — OR: Editor Requests Revision

```
POST /api/editorial/blogs/$BLOG_ID/request-revision
Authorization: Bearer $EDITOR_TOKEN
{
  "comment": "Please expand the introduction section."
}
```

Expected: `201 Created` with `{ status: "REVISION_REQUESTED", assignedEditorId: null }`

Then user can edit and resubmit (Steps 6→7 again), and a new editor can pick it.

---

## Step 12c — OR: Editor Rejects Blog

```
POST /api/editorial/blogs/$BLOG_ID/reject
Authorization: Bearer $EDITOR_TOKEN
{
  "comment": "Does not meet content standards."
}
```

Expected: `201 Created` with `{ status: "REJECTED" }`

---

## Step 13 — Admin Publishes Blog

(Only works if blog is `APPROVED`)

```
POST /api/admin/blogs/$BLOG_ID/publish
Authorization: Bearer $ADMIN_TOKEN
```

Expected: `201 Created` with `{ status: "PUBLISHED", publishedAt: "..." }`

---

## Step 14 — Public Lists Blogs

```
GET /api/blogs?page=1&limit=10
```

No token required. Expected: `200 OK` with published blogs only.

---

## Step 15 — Public Reads Blog by Slug

```
GET /api/blogs/my-first-blog-post
```

No token required. Expected: `200 OK` with full blog content.
Returns `404` if blog is not `PUBLISHED`.

---

## Blog Status Flow

```
DRAFT
  └─ [submit] ──────────────────────────────► SUBMITTED
                                                  │
                                            [editor pick]
                                                  │
                                                  ▼
                                            UNDER_REVIEW
                                           /      |      \
                              [approve]   /       |       \  [reject]
                                         /   [request-     \
                                        ▼    revision]      ▼
                                    APPROVED      │       REJECTED
                                        │         ▼
                               [admin   │   REVISION_REQUESTED
                               publish] │         │
                                        ▼    [author resubmit]
                                   PUBLISHED      │
                                        │         └─────────► SUBMITTED (loop)
                               [admin unpublish]
                                        │
                                        ▼
                                   UNPUBLISHED
```

---

## Error Codes Reference

| Code | Meaning |
|------|---------|
| 400  | Validation failed, invalid status transition, missing required comment |
| 401  | Missing or invalid JWT token |
| 403  | Wrong role, or editor not assigned to this blog |
| 404  | Blog or user not found |
| 409  | Duplicate email, or blog already picked by another editor |

---

## Admin User Management

```
POST   /api/admin/editors                     — create editor
POST   /api/admin/admins                      — create admin
PATCH  /api/admin/users/:id/promote-author    — promote USER to AUTHOR
PATCH  /api/admin/users/:id/block             — block user
PATCH  /api/admin/users/:id/unblock           — unblock user
GET    /api/admin/users?page=1&search=        — list users
GET    /api/admin/blogs?page=1&status=&search= — list all blogs
GET    /api/admin/stats                       — dashboard stats
```

All require `Authorization: Bearer $ADMIN_TOKEN`.

---

## My Blogs (Author)

```
GET    /api/blogs/my?page=1             — list my blogs
GET    /api/blogs/my/:id                — get my blog detail (with reviews)
GET    /api/blogs/me/stats              — my blog counts by status
POST   /api/blogs                       — create draft
PATCH  /api/blogs/:id                   — update draft (only DRAFT or REVISION_REQUESTED)
POST   /api/blogs/:id/submit            — submit for review
```

---

## Editorial Routes

```
GET    /api/editorial/submissions?page=1   — list SUBMITTED blogs
GET    /api/editorial/blogs/:id            — get blog detail (SUBMITTED or assigned)
POST   /api/editorial/blogs/:id/pick       — pick SUBMITTED blog
PATCH  /api/editorial/blogs/:id/edit       — edit assigned blog (creates version)
POST   /api/editorial/blogs/:id/approve    — approve (comment optional)
POST   /api/editorial/blogs/:id/reject     — reject (comment required, min 10 chars)
POST   /api/editorial/blogs/:id/request-revision — send back for revision (comment required)
GET    /api/editorial/stats                — editor dashboard stats
```

All require `Authorization: Bearer $EDITOR_TOKEN` (or `$ADMIN_TOKEN`).
