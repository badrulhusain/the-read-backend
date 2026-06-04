# The Read — Backend API

A production-ready RESTful API for a multi-user blogging platform. Built with NestJS, PostgreSQL, and Prisma ORM — featuring JWT authentication, role-based access control, threaded comments, image uploads via Cloudinary, and a full post lifecycle workflow.

---

## Project Status

| Area | Status |
|---|---|
| Authentication (JWT) | ✅ Complete |
| Role-Based Access Control | ✅ Complete |
| Users Module | ✅ Complete |
| Posts Module (CRUD + Lifecycle) | ✅ Complete |
| Tags Module | ✅ Complete |
| Comments Module (Threaded) | ✅ Complete |
| Image Uploads (Cloudinary) | ✅ Complete |
| Database Schema (Prisma) | ✅ Complete |
| Global Error Handling | ✅ Complete |
| CORS Configuration | ✅ Complete |
| Input Validation | ✅ Complete |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 (TypeScript) |
| Database | PostgreSQL (Neon cloud-hosted) |
| ORM | Prisma 7 |
| Authentication | JWT + Passport.js |
| Image Storage | Cloudinary |
| Validation | class-validator / class-transformer |
| Password Hashing | bcrypt (12 salt rounds) |
| Runtime | Node.js 20+ |

---

## Architecture Overview

```
src/
├── common/        # Decorators, guards, filters, shared enum exports
├── config/        # Application config
├── database/      # Prisma module and service
├── auth/          # Register, login, JWT strategy
├── users/         # Profile and admin user management
├── posts/         # Main blog draft/submission flow for authors
├── editorial/     # Editor review workflow for main blogs
├── freshers/      # Freshers Spot posts using the shared Post table
├── comments/      # Direct-publish comments on published posts
├── tags/          # Simple tag creation and post associations
├── uploads/       # Image upload endpoint
├── cloudinary/    # Cloudinary service wrapper
├── admin/         # Dashboard and global management endpoints
└── main.ts
```

The backend is organized around feature modules with thin controllers and service-level business rules. `AppModule` imports only the database/config layer and feature modules.

### Roles

The platform supports `READER`, `AUTHOR`, `EDITOR`, `ADMIN`, and `FRESHER`. Public registration may choose normal non-admin roles where supported by the client, but it cannot create `ADMIN` users directly.

### Post Lifecycle

Main blog posts use `PostType.MAIN_BLOG` and move through:

`DRAFT -> SUBMITTED -> UNDER_REVIEW -> PUBLISHED`

Editors can also move reviewed posts to `NEEDS_CHANGES` or `REJECTED`, and admins can change status or archive posts. Authors can create drafts, edit only their own `DRAFT` or `NEEDS_CHANGES` posts, and submit them for review; they cannot publish main blogs directly.

### Freshers Spot

Freshers Spot uses the same `Post` table with `PostType.FRESHERS_SPOT`. Logged-in `FRESHER`, `AUTHOR`, `EDITOR`, or `ADMIN` users can create Freshers Spot posts, and they publish immediately with `PostStatus.PUBLISHED` and `publishedAt` set. Admins can archive Freshers Spot content.

### Comments

Logged-in users can comment on published posts. Comments publish directly without an approval queue. Users can delete their own comments, while admins can delete any comment.

---

## Database Schema

### User
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | String? | Optional display name |
| email | String | Unique, indexed |
| password | String | bcrypt hashed, never returned in responses |
| role | Enum | `ADMIN`, `AUTHOR`, `READER` (default: `READER`) |
| createdAt | DateTime | Auto-set |
| updatedAt | DateTime | Auto-updated |

### Post
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| slug | String | Unique, indexed, auto-generated from title |
| title | String | |
| content | String | |
| excerpt | String? | Optional summary |
| coverImage | String? | URL to Cloudinary-hosted image |
| type | String? | Optional content category |
| viewCount | Int | Auto-incremented on slug access |
| status | Enum | `DRAFT`, `PUBLISHED`, `ARCHIVED` (default: `DRAFT`) |
| authorId | UUID | FK → User |
| publishedAt | DateTime? | Set automatically when status → `PUBLISHED` |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Tag
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | String | Unique |
| createdAt | DateTime | |

### PostTag (junction)
| Field | Type | Notes |
|---|---|---|
| postId | UUID | FK → Post |
| tagId | UUID | FK → Tag |

### Comment
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| content | String | |
| postId | UUID | FK → Post, indexed |
| authorId | UUID | FK → User, indexed |
| parentId | UUID? | FK → Comment self-reference (threading) |
| createdAt | DateTime | |

---

## API Reference

**Base URL:** `/api`

All protected routes require the header:
```
Authorization: Bearer <token>
```

---

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new user |
| `POST` | `/api/auth/login` | Public | Login, returns JWT token |
| `GET` | `/api/auth/me` | JWT | Get current user profile |

**Register body:**
```json
{
  "email": "user@example.com",
  "password": "minimum8chars",
  "name": "Display Name"
}
```

**Login response:**
```json
{
  "user": { "id": "...", "email": "...", "role": "READER" },
  "access_token": "<jwt>"
}
```

---

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users` | JWT + ADMIN | List all users |
| `GET` | `/api/users/:id` | JWT | Get user by ID (includes latest 10 posts) |
| `PATCH` | `/api/users/:id` | JWT | Update user profile |
| `DELETE` | `/api/users/:id` | JWT + ADMIN | Delete user |

---

### Posts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/posts` | JWT | Create a new post |
| `GET` | `/api/posts` | Public | List posts with pagination and filters |
| `GET` | `/api/posts/:id` | Public | Get post by ID |
| `GET` | `/api/posts/slug/:slug` | Public | Get post by slug (increments view count) |
| `PATCH` | `/api/posts/:id` | JWT | Update post |
| `DELETE` | `/api/posts/:id` | JWT + ADMIN | Delete post |

**Query parameters for `GET /api/posts`:**

| Param | Default | Description |
|---|---|---|
| `page` | `1` | Page number |
| `limit` | `10` | Results per page |
| `status` | — | Filter by `DRAFT`, `PUBLISHED`, or `ARCHIVED` |
| `tag` | — | Filter by tag name |

**Create / update post body:**
```json
{
  "title": "My Post Title",
  "content": "Full post body...",
  "excerpt": "Short summary shown in listings",
  "coverImage": "https://res.cloudinary.com/...",
  "status": "DRAFT",
  "tags": ["technology", "javascript"]
}
```

---

### Tags

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/tags` | JWT | Create a tag |
| `GET` | `/api/tags` | Public | List all tags |
| `GET` | `/api/tags/:id` | Public | Get tag with associated posts |
| `PATCH` | `/api/tags/:id` | JWT | Update tag |
| `DELETE` | `/api/tags/:id` | JWT | Delete tag |

---

### Comments

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/comments` | JWT | Create a comment or reply |
| `GET` | `/api/comments` | Public | List top-level comments with nested replies |
| `GET` | `/api/comments/post/:postId` | Public | Get all comments for a post |
| `GET` | `/api/comments/:id` | Public | Get a single comment with its replies |
| `PATCH` | `/api/comments/:id` | JWT | Update a comment |
| `DELETE` | `/api/comments/:id` | JWT | Delete a comment |

**Create comment body:**
```json
{
  "content": "Great article!",
  "postId": "<post-uuid>",
  "parentId": "<parent-comment-uuid>"
}
```
> Omit `parentId` for top-level comments. Include it to reply to an existing comment (supports infinite nesting).

---

### Uploads

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/uploads/image` | JWT | Upload an image to Cloudinary |

**Request:** `multipart/form-data` with field `file`.
- Max file size: **5 MB**
- Accepted types: images only (`image/*`)

**Response:**
```json
{
  "url": "https://res.cloudinary.com/...",
  "publicId": "the-read/covers/..."
}
```

---

## Role Permissions Summary

| Action | READER | AUTHOR | ADMIN |
|---|---|---|---|
| Read posts / tags / comments | ✅ | ✅ | ✅ |
| Create posts | — | ✅ | ✅ |
| Edit own posts | — | ✅ | ✅ |
| Delete any post | — | — | ✅ |
| Create comments | ✅ | ✅ | ✅ |
| Edit / delete own comments | ✅ | ✅ | ✅ |
| Upload images | ✅ | ✅ | ✅ |
| List all users | — | — | ✅ |
| Delete users | — | — | ✅ |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or cloud, e.g., [Neon](https://neon.tech))
- Cloudinary account

### Installation

```bash
git clone https://github.com/<your-org>/the-read-backend.git
cd the-read-backend
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
# Database
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require
DIRECT_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require

# Auth
JWT_ACCESS_SECRET=your-super-secret-key-change-in-production
JWT_REFRESH_SECRET=another-super-secret-key-change-in-production
JWT_EXPIRATION=7d

# Server
PORT=3000
NODE_ENV=development

# CORS — allowed frontend origin(s)
FRONTEND_URL=http://localhost:5173

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### Database Setup

```bash
# Apply migrations and generate Prisma client
npx prisma migrate deploy
npx prisma generate
```

### Run

```bash
# Development (hot-reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000/api`.

---

## Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Development mode with auto-reload |
| `npm run build` | Compile TypeScript + generate Prisma client |
| `npm run start:prod` | Run compiled production build |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run format` | Format code with Prettier |
| `npm test` | Run unit tests |
| `npm run test:cov` | Generate test coverage report |
| `npm run test:e2e` | Run end-to-end tests |

---

## Key Implementation Details

- **Slug generation** — slugs are auto-generated from the post title on creation. Duplicate slugs receive a numeric suffix (e.g., `my-post-2`).
- **View counting** — accessing a post via `/api/posts/slug/:slug` atomically increments its `viewCount` field.
- **Threaded comments** — comments support infinite nesting via `parentId` self-reference. Top-level queries eagerly return all nested replies.
- **Post lifecycle** — posts follow a `DRAFT → PUBLISHED → ARCHIVED` workflow. The `publishedAt` timestamp is set automatically when status changes to `PUBLISHED`.
- **CORS** — origins are validated dynamically against `FRONTEND_URL`. Credentials are enabled for header-based auth.
- **Error responses** — all errors follow a consistent format with `statusCode`, `message`, `timestamp`, and `path`. Stack traces are included only in development.
- **Validation** — all request bodies are validated with `class-validator`. Unknown fields are stripped automatically (whitelist mode enabled globally).
- **Security** — passwords are hashed with bcrypt (12 rounds) and are never returned in any response. JWT tokens expire after a configurable duration (default `7d`).

---

## Project Structure

```
the-read-backend/
├── prisma/
│   └── schema.prisma              # Database models and relations
├── src/
│   ├── auth/
│   │   ├── decorators/            # @Roles() decorator
│   │   ├── dto/                   # RegisterDto, LoginDto
│   │   ├── guards/                # JwtAuthGuard, RolesGuard
│   │   ├── strategies/            # JwtStrategy
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── users/
│   │   ├── dto/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   ├── posts/
│   │   ├── dto/
│   │   ├── posts.controller.ts
│   │   ├── posts.service.ts
│   │   └── posts.module.ts
│   ├── comments/
│   │   ├── dto/
│   │   ├── comments.controller.ts
│   │   ├── comments.service.ts
│   │   └── comments.module.ts
│   ├── tags/
│   │   ├── dto/
│   │   ├── tags.controller.ts
│   │   ├── tags.service.ts
│   │   └── tags.module.ts
│   ├── uploads/
│   │   ├── uploads.controller.ts
│   │   └── uploads.module.ts
│   ├── cloudinary/
│   │   ├── cloudinary.service.ts
│   │   └── cloudinary.module.ts
│   ├── common/
│   │   └── filters/
│   │       └── global-exception.filter.ts
│   ├── app.module.ts
│   ├── prisma.service.ts
│   └── main.ts
├── .env.example
├── package.json
└── tsconfig.json
```
