import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BlogStatus,
  Prisma,
  ReviewDecision,
  Role,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EditorialEditDto } from './dto/editorial-edit.dto';
import {
  ApproveBlogDto,
  RejectBlogDto,
  RequestRevisionDto,
} from './dto/editorial-note.dto';
import {
  EditorialBlogQueryDto,
  EditorialQueryDto,
} from './dto/editorial-query.dto';
import { generateSlug, makeUniqueSlug } from '../common/utils/slug.util';
import { paginate } from '../common/utils/pagination.util';
import { sanitizeBlogHtml } from '../common/utils/sanitize-blog-html';
import { computeReadingStats } from '../common/utils/reading-time';

type RequestUser = { id: string; role: Role };

const ALREADY_PROCESSED: BlogStatus[] = [
  BlogStatus.APPROVED,
  BlogStatus.REJECTED,
  BlogStatus.PUBLISHED,
  BlogStatus.UNPUBLISHED,
  BlogStatus.ARCHIVED,
];

const REVIEW_SELECT = {
  id: true,
  decision: true,
  comment: true,
  plagiarismScore: true,
  plagiarismNote: true,
  checklist: true,
  createdAt: true,
  editor: { select: { id: true, name: true, email: true, role: true } },
} as const;

const SUBMISSION_LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  coverImage: true,
  coverImageAltText: true,
  coverImageCrop: true,
  coverImageUploadedById: true,
  status: true,
  authorId: true,
  assignedEditorId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, email: true } },
} as const;

const BLOG_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  content: true,
  coverImage: true,
  coverImageAltText: true,
  coverImageCrop: true,
  coverImageUploadedById: true,
  status: true,
  authorId: true,
  assignedEditorId: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, email: true } },
  assignedEditor: { select: { id: true, name: true, email: true } },
  reviews: {
    select: REVIEW_SELECT,
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

@Injectable()
export class EditorialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async getStats(user: RequestUser) {
    const [
      submittedBlogs,
      underReviewByMe,
      approved,
      rejectedOrRevisionRequested,
    ] = await Promise.all([
      this.prisma.blog.count({
        where: { status: BlogStatus.SUBMITTED },
      }),
      this.prisma.blog.count({
        where: { status: BlogStatus.UNDER_REVIEW, assignedEditorId: user.id },
      }),
      this.prisma.blog.count({
        where: { status: BlogStatus.APPROVED },
      }),
      this.prisma.blog.count({
        where: {
          status: { in: [BlogStatus.REJECTED, BlogStatus.REVISION_REQUESTED] },
        },
      }),
    ]);

    return {
      submittedBlogs,
      underReviewByMe,
      approved,
      rejectedOrRevisionRequested,
    };
  }

  async getBlog(id: string, user: RequestUser) {
    const blog = await this.prisma.blog.findUnique({
      where: { id },
      select: BLOG_SELECT,
    });
    if (!blog) throw new NotFoundException('Blog not found');

    if (user.role !== Role.ADMIN) {
      const canView =
        blog.status === BlogStatus.SUBMITTED ||
        blog.assignedEditorId === user.id;
      if (!canView) {
        throw new ForbiddenException('You do not have access to this blog');
      }
    }

    return blog;
  }

  async listSubmissions(query: EditorialQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = { status: BlogStatus.SUBMITTED };

    const [data, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        select: SUBMISSION_LIST_SELECT,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.blog.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async listBlogs(query: EditorialBlogQueryDto, user: RequestUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where =
      user.role === Role.ADMIN
        ? { ...(query.status ? { status: query.status } : {}) }
        : {
            assignedEditorId: user.id,
            ...(query.status ? { status: query.status } : {}),
          };

    const [data, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        select: SUBMISSION_LIST_SELECT,
        orderBy: { updatedAt: 'desc' as const },
        skip,
        take: limit,
      }),
      this.prisma.blog.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async pick(id: string, user: RequestUser) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog not found');

    if (blog.status !== BlogStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED blogs can be picked');
    }
    if (blog.assignedEditorId) {
      throw new ConflictException('This blog is already assigned to an editor');
    }

    const updated = await this.prisma.blog.update({
      where: { id },
      data: { status: BlogStatus.UNDER_REVIEW, assignedEditorId: user.id },
      select: BLOG_SELECT,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_PICKED',
      entityType: 'Blog',
      entityId: id,
      metadata: {
        oldStatus: BlogStatus.SUBMITTED,
        newStatus: BlogStatus.UNDER_REVIEW,
        assignedEditorId: user.id,
      },
    });

    return updated;
  }

  async edit(id: string, user: RequestUser, dto: EditorialEditDto) {
    const blog = await this.assertEditorialEditAccess(id, user);

    const data: Record<string, unknown> = { ...dto };

    if (dto.title && dto.title !== blog.title) {
      const base = generateSlug(dto.title);
      const existing = await this.prisma.blog.findMany({
        where: { slug: { startsWith: base }, NOT: { id } },
        select: { slug: true },
      });
      const slugSet = new Set(existing.map((b) => b.slug));
      data.slug = makeUniqueSlug(base, slugSet);
    }

    if (dto.content !== undefined) {
      const sanitized = sanitizeBlogHtml(dto.content);
      if (!sanitized.trim()) {
        throw new BadRequestException(
          'Blog content is empty after sanitization',
        );
      }
      const { wordCount, readingTime } = computeReadingStats(sanitized);
      data.content = sanitized;
      data.wordCount = wordCount;
      data.readingTime = readingTime;
    }

    const nextVersionNumber = await this.prisma.blogVersion.count({
      where: { blogId: id },
    });
    await this.prisma.blogVersion.create({
      data: {
        blogId: id,
        title: blog.title,
        content: blog.content,
        editedById: user.id,
        versionNumber: nextVersionNumber + 1,
      },
    });

    const updated = await this.prisma.blog.update({
      where: { id },
      data,
      select: BLOG_SELECT,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_EDITED_BY_EDITOR',
      entityType: 'Blog',
      entityId: id,
      metadata: { versionNumber: nextVersionNumber + 1 },
    });

    return updated;
  }

  async approve(id: string, user: RequestUser, dto: ApproveBlogDto) {
    await this.assertReviewer(id, user);

    if (dto.checklist) {
      const cl = dto.checklist;
      if (cl.readyToPublish === false) {
        throw new BadRequestException(
          'Cannot approve: checklist.readyToPublish must be true',
        );
      }
    }

    const [updatedBlog, review] = await this.prisma.$transaction([
      this.prisma.blog.update({
        where: { id },
        data: { status: BlogStatus.APPROVED },
        select: BLOG_SELECT,
      }),
      this.prisma.blogReview.create({
        data: {
          blogId: id,
          editorId: user.id,
          decision: ReviewDecision.APPROVED,
          comment: dto.comment ?? null,
          plagiarismScore: dto.plagiarismScore ?? null,
          plagiarismNote: dto.plagiarismNote ?? null,
          checklist: dto.checklist as unknown as
            | Prisma.InputJsonValue
            | undefined,
        },
        select: REVIEW_SELECT,
      }),
    ]);

    const plagiarismHigh =
      dto.plagiarismScore !== undefined && dto.plagiarismScore > 30;

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_APPROVED',
      entityType: 'Blog',
      entityId: id,
      metadata: {
        reviewId: review.id,
        oldStatus: BlogStatus.UNDER_REVIEW,
        newStatus: BlogStatus.APPROVED,
        ...(dto.plagiarismScore !== undefined
          ? { plagiarismScore: dto.plagiarismScore }
          : {}),
        ...(plagiarismHigh ? { plagiarismWarning: true } : {}),
      },
    });

    return {
      blog: updatedBlog,
      review,
      ...(plagiarismHigh
        ? {
            warning:
              'Plagiarism score exceeds 30. Verify original content before publishing.',
          }
        : {}),
    };
  }

  async reject(id: string, user: RequestUser, dto: RejectBlogDto) {
    await this.assertReviewer(id, user);

    const [updatedBlog, review] = await this.prisma.$transaction([
      this.prisma.blog.update({
        where: { id },
        data: { status: BlogStatus.REJECTED },
        select: BLOG_SELECT,
      }),
      this.prisma.blogReview.create({
        data: {
          blogId: id,
          editorId: user.id,
          decision: ReviewDecision.REJECTED,
          comment: dto.comment,
          plagiarismScore: dto.plagiarismScore ?? null,
          plagiarismNote: dto.plagiarismNote ?? null,
          checklist: dto.checklist as unknown as
            | Prisma.InputJsonValue
            | undefined,
        },
        select: REVIEW_SELECT,
      }),
    ]);

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_REJECTED',
      entityType: 'Blog',
      entityId: id,
      metadata: {
        reviewId: review.id,
        oldStatus: BlogStatus.UNDER_REVIEW,
        newStatus: BlogStatus.REJECTED,
        comment: dto.comment,
        ...(dto.plagiarismScore !== undefined
          ? { plagiarismScore: dto.plagiarismScore }
          : {}),
      },
    });

    return { blog: updatedBlog, review };
  }

  async requestRevision(
    id: string,
    user: RequestUser,
    dto: RequestRevisionDto,
  ) {
    await this.assertReviewer(id, user);

    const [updatedBlog, review] = await this.prisma.$transaction([
      this.prisma.blog.update({
        where: { id },
        data: { status: BlogStatus.REVISION_REQUESTED, assignedEditorId: null },
        select: BLOG_SELECT,
      }),
      this.prisma.blogReview.create({
        data: {
          blogId: id,
          editorId: user.id,
          decision: ReviewDecision.REVISION_REQUESTED,
          comment: dto.comment,
          plagiarismScore: dto.plagiarismScore ?? null,
          plagiarismNote: dto.plagiarismNote ?? null,
          checklist: dto.checklist as unknown as
            | Prisma.InputJsonValue
            | undefined,
        },
        select: REVIEW_SELECT,
      }),
    ]);

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_REVISION_REQUESTED',
      entityType: 'Blog',
      entityId: id,
      metadata: {
        reviewId: review.id,
        oldStatus: BlogStatus.UNDER_REVIEW,
        newStatus: BlogStatus.REVISION_REQUESTED,
        comment: dto.comment,
        ...(dto.plagiarismScore !== undefined
          ? { plagiarismScore: dto.plagiarismScore }
          : {}),
      },
    });

    return { blog: updatedBlog, review };
  }

  private async assertReviewer(id: string, user: RequestUser) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog not found');

    if (ALREADY_PROCESSED.includes(blog.status)) {
      throw new ConflictException('Blog has already been processed');
    }

    if (blog.status !== BlogStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        'Blog must be UNDER_REVIEW to perform this action',
      );
    }

    if (user.role !== Role.ADMIN && blog.assignedEditorId !== user.id) {
      throw new ForbiddenException(
        'Only the assigned editor or admin can act on this blog',
      );
    }

    return blog;
  }

  private async assertEditorialEditAccess(id: string, user: RequestUser) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog not found');

    if (ALREADY_PROCESSED.includes(blog.status)) {
      throw new ConflictException('Blog has already been processed');
    }

    const editableStatus =
      blog.status === BlogStatus.SUBMITTED ||
      blog.status === BlogStatus.UNDER_REVIEW;
    if (!editableStatus) {
      throw new BadRequestException(
        'Blog must be SUBMITTED or UNDER_REVIEW to edit',
      );
    }

    if (
      user.role !== Role.ADMIN &&
      blog.status === BlogStatus.UNDER_REVIEW &&
      blog.assignedEditorId !== user.id
    ) {
      throw new ForbiddenException(
        'Only the assigned editor or admin can edit this blog',
      );
    }

    return blog;
  }
}
