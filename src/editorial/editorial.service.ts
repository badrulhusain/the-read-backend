import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BlogStatus,
  EditorRecommendation,
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
import {
  CorrectionDto,
  CriticalEvaluationDto,
} from './dto/critical-evaluation.dto';
import { SaveEditorialReviewDto } from './dto/editorial-workflow.dto';
import { assertBlogTransition } from '../common/workflow/blog-state-machine';

type RequestUser = { id: string; role: Role };

const ALREADY_PROCESSED: BlogStatus[] = [
  BlogStatus.READY_FOR_ADMIN,
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
  revision: true,
  approvedRevision: true,
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
  category: { select: { id: true, name: true, slug: true } },
  tags: {
    select: { tag: { select: { id: true, name: true, slug: true } } },
  },
  thumbnail: true,
  sources: { orderBy: { createdAt: 'asc' as const } },
  editorialReviews: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
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
        where: { status: BlogStatus.EDITING },
      }),
      this.prisma.blog.count({
        where: { status: BlogStatus.QUALITY_REVIEW, assignedEditorId: user.id },
      }),
      this.prisma.blog.count({
        where: { status: BlogStatus.READY_FOR_ADMIN },
      }),
      this.prisma.blog.count({
        where: {
          status: { in: [BlogStatus.REJECTED, BlogStatus.NEEDS_CORRECTION] },
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
        blog.status === BlogStatus.EDITING || blog.assignedEditorId === user.id;
      if (!canView) {
        throw new ForbiddenException('You do not have access to this blog');
      }
    }

    const { editorialReviews, ...article } = blog;
    return {
      ...article,
      editorialReview: editorialReviews[0] ?? null,
    };
  }

  async listSubmissions(query: EditorialQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = { status: BlogStatus.EDITING };

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

  async listMyWork(query: EditorialBlogQueryDto, user: RequestUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = {
      OR: [{ createdById: user.id }, { assignedEditorId: user.id }],
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        select: SUBMISSION_LIST_SELECT,
        orderBy: { updatedAt: 'desc' },
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

    assertBlogTransition(blog.status, BlogStatus.QUALITY_REVIEW);
    if (blog.assignedEditorId) {
      throw new ConflictException('This blog is already assigned to an editor');
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.blog.updateMany({
        where: {
          id,
          status: BlogStatus.EDITING,
          assignedEditorId: null,
          revision: blog.revision,
        },
        data: {
          status: BlogStatus.QUALITY_REVIEW,
          assignedEditorId: user.id,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Another editor picked this article first');
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_PICKED',
          entityType: 'Blog',
          entityId: id,
          metadata: {
            oldStatus: BlogStatus.EDITING,
            newStatus: BlogStatus.QUALITY_REVIEW,
            assignedEditorId: user.id,
          },
        },
      });
      return tx.blog.findUniqueOrThrow({
        where: { id },
        select: BLOG_SELECT,
      });
    });
  }

  async assign(id: string, user: RequestUser, editorId: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog not found');
    if (user.role !== Role.ADMIN && editorId !== user.id) {
      throw new ForbiddenException(
        'Editors can only assign work to themselves',
      );
    }

    const editor = await this.prisma.user.findFirst({
      where: { id: editorId, role: { in: [Role.EDITOR, Role.ADMIN] } },
      select: { id: true },
    });
    if (!editor) throw new NotFoundException('Editor not found');

    if (
      blog.status !== BlogStatus.EDITING &&
      blog.status !== BlogStatus.QUALITY_REVIEW
    ) {
      throw new ConflictException('This article cannot be assigned now');
    }
    if (blog.status === BlogStatus.EDITING) {
      assertBlogTransition(blog.status, BlogStatus.QUALITY_REVIEW);
    }
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.blog.updateMany({
        where: {
          id,
          status: blog.status,
          revision: blog.revision,
          assignedEditorId: blog.assignedEditorId,
        },
        data: {
          assignedEditorId: editorId,
          ...(blog.status === BlogStatus.EDITING
            ? { status: BlogStatus.QUALITY_REVIEW }
            : {}),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Article assignment changed concurrently');
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_ASSIGNED',
          entityType: 'Blog',
          entityId: id,
          metadata: { assignedEditorId: editorId },
        },
      });
      return tx.blog.findUniqueOrThrow({
        where: { id },
        select: BLOG_SELECT,
      });
    });
  }

  async saveReview(id: string, user: RequestUser, dto: SaveEditorialReviewDto) {
    const blog = await this.assertReviewer(id, user);
    const recommendation =
      dto.recommendation === 'APPROVE'
        ? EditorRecommendation.READY_FOR_ADMIN
        : dto.recommendation === 'RETURN'
          ? EditorRecommendation.NEEDS_CORRECTION
          : dto.recommendation === 'REJECT'
            ? EditorRecommendation.REJECT
            : undefined;

    await this.prisma.$transaction(async (tx) => {
      const review = await tx.editorialReview.create({
        data: {
          blogId: id,
          blogRevision: blog.revision,
          editorId: user.id,
          internalNotes: dto.internalNotes,
          plagiarismScore: dto.plagiarismScore,
          factCheckStatus: dto.factCheckComplete ? 'PASSED' : 'NOT_STARTED',
          recommendation,
          checklist: {
            ...(dto.editorialChecklist ?? {}),
            plagiarismReviewed: dto.plagiarismReviewed ?? false,
            factCheckComplete: dto.factCheckComplete ?? false,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'EDITORIAL_REVIEW_SAVED',
          entityType: 'Blog',
          entityId: id,
          metadata: { reviewId: review.id },
        },
      });
    });

    return this.getBlog(id, user);
  }

  async edit(id: string, user: RequestUser, dto: EditorialEditDto) {
    const blog = await this.assertEditorialEditAccess(id, user);

    const { revision, ...editable } = dto;
    const data: Record<string, unknown> = { ...editable };

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

    return this.prisma.$transaction(async (tx) => {
      const versionNumber = blog.revision;
      await tx.blogVersion.create({
        data: {
          blogId: id,
          title: blog.title,
          excerpt: blog.excerpt,
          content: blog.content,
          editedById: user.id,
          versionNumber,
          status: blog.status,
          wordCount: blog.wordCount,
          readingTime: blog.readingTime,
        },
      });
      const claimed = await tx.blog.updateMany({
        where: { id, revision, status: blog.status },
        data: {
          ...(data as Prisma.BlogUpdateManyMutationInput),
          revision: { increment: 1 },
          approvedRevision: null,
          approvedAt: null,
          approvedById: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'Article changed since it was loaded; refresh and retry',
        );
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_EDITED_BY_EDITOR',
          entityType: 'Blog',
          entityId: id,
          metadata: { versionNumber },
        },
      });
      return tx.blog.findUniqueOrThrow({
        where: { id },
        select: BLOG_SELECT,
      });
    });
  }

  async approve(id: string, user: RequestUser, dto: ApproveBlogDto) {
    const current = await this.assertReviewer(id, user);

    if (dto.checklist) {
      const cl = dto.checklist;
      if (cl.readyToPublish === false) {
        throw new BadRequestException(
          'Cannot approve: checklist.readyToPublish must be true',
        );
      }
    }

    assertBlogTransition(current.status, BlogStatus.READY_FOR_ADMIN);
    const plagiarismHigh =
      dto.plagiarismScore !== undefined && dto.plagiarismScore > 30;
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.blog.updateMany({
        where: { id, status: current.status, revision: current.revision },
        data: { status: BlogStatus.READY_FOR_ADMIN },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Article state changed concurrently');
      }
      const review = await tx.blogReview.create({
        data: {
          blogId: id,
          editorId: user.id,
          decision: ReviewDecision.READY_FOR_ADMIN,
          comment: dto.comment ?? null,
          plagiarismScore: dto.plagiarismScore ?? null,
          plagiarismNote: dto.plagiarismNote ?? null,
          checklist: dto.checklist as unknown as
            | Prisma.InputJsonValue
            | undefined,
        },
        select: REVIEW_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_APPROVED',
          entityType: 'Blog',
          entityId: id,
          metadata: {
            reviewId: review.id,
            oldStatus: current.status,
            newStatus: BlogStatus.READY_FOR_ADMIN,
            revision: current.revision,
            ...(dto.plagiarismScore !== undefined
              ? { plagiarismScore: dto.plagiarismScore }
              : {}),
            ...(plagiarismHigh ? { plagiarismWarning: true } : {}),
          },
        },
      });
      return {
        blog: await tx.blog.findUniqueOrThrow({
          where: { id },
          select: BLOG_SELECT,
        }),
        review,
        ...(plagiarismHigh
          ? {
              warning:
                'Plagiarism score exceeds 30. Verify original content before publishing.',
            }
          : {}),
      };
    });
  }

  async reject(id: string, user: RequestUser, dto: RejectBlogDto) {
    const current = await this.assertReviewer(id, user);
    assertBlogTransition(current.status, BlogStatus.REJECTED);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.blog.updateMany({
        where: { id, status: current.status, revision: current.revision },
        data: { status: BlogStatus.REJECTED },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Article state changed concurrently');
      }
      const review = await tx.blogReview.create({
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
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_REJECTED',
          entityType: 'Blog',
          entityId: id,
          metadata: {
            reviewId: review.id,
            oldStatus: current.status,
            newStatus: BlogStatus.REJECTED,
            comment: dto.comment,
          },
        },
      });
      return {
        blog: await tx.blog.findUniqueOrThrow({
          where: { id },
          select: BLOG_SELECT,
        }),
        review,
      };
    });
  }

  async requestRevision(
    id: string,
    user: RequestUser,
    dto: RequestRevisionDto,
  ) {
    const current = await this.assertReviewer(id, user);
    assertBlogTransition(current.status, BlogStatus.NEEDS_CORRECTION);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.blog.updateMany({
        where: { id, status: current.status, revision: current.revision },
        data: { status: BlogStatus.NEEDS_CORRECTION, assignedEditorId: null },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Article state changed concurrently');
      }
      const review = await tx.blogReview.create({
        data: {
          blogId: id,
          editorId: user.id,
          decision: ReviewDecision.NEEDS_RESPONSE,
          comment: dto.comment,
          plagiarismScore: dto.plagiarismScore ?? null,
          plagiarismNote: dto.plagiarismNote ?? null,
          checklist: dto.checklist as unknown as
            | Prisma.InputJsonValue
            | undefined,
        },
        select: REVIEW_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_REVISION_REQUESTED',
          entityType: 'Blog',
          entityId: id,
          metadata: {
            reviewId: review.id,
            oldStatus: current.status,
            newStatus: BlogStatus.NEEDS_CORRECTION,
            comment: dto.comment,
          },
        },
      });
      return {
        blog: await tx.blog.findUniqueOrThrow({
          where: { id },
          select: BLOG_SELECT,
        }),
        review,
      };
    });
  }

  async submitCriticalEvaluation(
    id: string,
    user: RequestUser,
    dto: CriticalEvaluationDto,
  ) {
    const blog = await this.assertReviewer(id, user);
    if (
      !dto.copyrightConfirmed &&
      dto.recommendation === EditorRecommendation.READY_FOR_ADMIN
    ) {
      throw new BadRequestException(
        'Copyright confirmation is required before recommending admin approval',
      );
    }
    if (
      dto.recommendation === EditorRecommendation.READY_FOR_ADMIN &&
      dto.requiredCorrections.length
    ) {
      throw new BadRequestException(
        'A READY_FOR_ADMIN recommendation cannot contain required corrections',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.editorialReview.create({
        data: {
          blogId: id,
          blogRevision: blog.revision,
          editorId: user.id,
          contentQualityScore: dto.contentQualityScore,
          grammarStatus: dto.grammarStatus,
          readabilityScore: dto.readabilityScore,
          plagiarismScore: dto.plagiarismScore,
          plagiarismNotes: dto.plagiarismNotes,
          factCheckStatus: dto.factCheckStatus,
          factCheckNotes: dto.factCheckNotes,
          sourceVerificationStatus: dto.sourceVerificationStatus,
          headlineQuality: dto.headlineQuality,
          introductionQuality: dto.introductionQuality,
          structureQuality: dto.structureQuality,
          conclusionQuality: dto.conclusionQuality,
          seoReadiness: dto.seoReadiness,
          thumbnailQuality: dto.thumbnailQuality,
          copyrightConfirmed: dto.copyrightConfirmed,
          recommendation: dto.recommendation,
          internalNotes: dto.internalNotes,
          requiredCorrections: dto.requiredCorrections,
          checklist: dto.finalChecklist as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'CRITICAL_EVALUATION_SUBMITTED',
          entityType: 'Blog',
          entityId: id,
          metadata: {
            reviewId: review.id,
            recommendation: dto.recommendation,
          },
        },
      });
      return review;
    });
  }

  async completeQualityReview(id: string, user: RequestUser) {
    await this.assertReviewer(id, user);
    const review = await this.prisma.editorialReview.findFirst({
      where: { blogId: id, editorId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!review) {
      throw new BadRequestException(
        'Save a critical editorial evaluation before completing review',
      );
    }
    await this.audit.log({
      actorId: user.id,
      action: 'QUALITY_REVIEW_COMPLETED',
      entityType: 'Blog',
      entityId: id,
      metadata: { reviewId: review.id },
    });
    return this.getBlog(id, user);
  }

  async returnForCorrection(id: string, user: RequestUser, dto: CorrectionDto) {
    const current = await this.assertReviewer(id, user);
    assertBlogTransition(current.status, BlogStatus.NEEDS_CORRECTION);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.blog.updateMany({
        where: { id, status: current.status, revision: current.revision },
        data: { status: BlogStatus.NEEDS_CORRECTION },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Article state changed concurrently');
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_RETURNED_FOR_CORRECTION',
          entityType: 'Blog',
          entityId: id,
          metadata: {
            reason: dto.reason,
            requiredCorrections: dto.requiredCorrections,
          },
        },
      });
      return tx.blog.findUniqueOrThrow({
        where: { id },
        select: BLOG_SELECT,
      });
    });
  }

  async sendToAdmin(id: string, user: RequestUser) {
    const current = await this.assertReviewer(id, user);
    const latest = await this.prisma.editorialReview.findFirst({
      where: { blogId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !latest ||
      latest.recommendation !== EditorRecommendation.READY_FOR_ADMIN ||
      latest.blogRevision !== current.revision
    ) {
      throw new BadRequestException(
        'A READY_FOR_ADMIN critical evaluation is required',
      );
    }
    if (!latest.copyrightConfirmed) {
      throw new BadRequestException('Copyright must be confirmed');
    }
    assertBlogTransition(current.status, BlogStatus.READY_FOR_ADMIN);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.blog.updateMany({
        where: {
          id,
          status: current.status,
          revision: current.revision,
        },
        data: { status: BlogStatus.READY_FOR_ADMIN },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Article state changed concurrently');
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_SENT_TO_ADMIN',
          entityType: 'Blog',
          entityId: id,
          metadata: {
            reviewId: latest.id,
            revision: current.revision,
            oldStatus: current.status,
            newStatus: BlogStatus.READY_FOR_ADMIN,
          },
        },
      });
      return tx.blog.findUniqueOrThrow({
        where: { id },
        select: BLOG_SELECT,
      });
    });
  }

  private async assertReviewer(id: string, user: RequestUser) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog not found');

    if (ALREADY_PROCESSED.includes(blog.status)) {
      throw new ConflictException('Blog has already been processed');
    }

    if (blog.status !== BlogStatus.QUALITY_REVIEW) {
      throw new ConflictException(
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
      blog.status === BlogStatus.EDITING ||
      blog.status === BlogStatus.QUALITY_REVIEW;
    if (!editableStatus) {
      throw new ConflictException(
        'Blog must be SUBMITTED or UNDER_REVIEW to edit',
      );
    }

    if (
      user.role !== Role.ADMIN &&
      blog.status === BlogStatus.QUALITY_REVIEW &&
      blog.assignedEditorId !== user.id
    ) {
      throw new ForbiddenException(
        'Only the assigned editor or admin can edit this blog',
      );
    }

    return blog;
  }
}
