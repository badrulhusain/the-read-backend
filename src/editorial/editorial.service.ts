import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogStatus, ReviewDecision, Role } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EditorialEditDto } from './dto/editorial-edit.dto';
import { EditorialDecisionDto } from './dto/editorial-note.dto';
import { EditorialQueryDto } from './dto/editorial-query.dto';
import { generateSlug, makeUniqueSlug } from '../common/utils/slug.util';
import { paginate } from '../common/utils/pagination.util';

type RequestUser = { id: string; role: Role };

const BLOG_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  content: true,
  coverImage: true,
  status: true,
  authorId: true,
  assignedEditorId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, email: true } },
  assignedEditor: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class EditorialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async getStats(user: RequestUser) {
    const [submittedBlogs, underReviewByMe, approved, rejectedOrRevisionRequested] =
      await this.prisma.$transaction([
        this.prisma.blog.count({ where: { status: BlogStatus.SUBMITTED } }),
        this.prisma.blog.count({
          where: { status: BlogStatus.UNDER_REVIEW, assignedEditorId: user.id },
        }),
        this.prisma.blog.count({ where: { status: BlogStatus.APPROVED } }),
        this.prisma.blog.count({
          where: {
            status: { in: [BlogStatus.REJECTED, BlogStatus.REVISION_REQUESTED] },
          },
        }),
      ]);

    return { submittedBlogs, underReviewByMe, approved, rejectedOrRevisionRequested };
  }

  async getBlog(id: string, user: RequestUser) {
    const blog = await this.prisma.blog.findUnique({ where: { id }, select: BLOG_SELECT });
    if (!blog) throw new NotFoundException('Blog not found');

    if (
      user.role !== Role.ADMIN &&
      blog.assignedEditorId !== user.id &&
      blog.status === BlogStatus.UNDER_REVIEW
    ) {
      throw new ForbiddenException('You are not assigned to this blog');
    }

    return blog;
  }

  async listSubmissions(query: EditorialQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = { status: BlogStatus.SUBMITTED };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blog.findMany({
        where,
        select: BLOG_SELECT,
        orderBy: { createdAt: 'asc' },
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
    });

    return updated;
  }

  async edit(id: string, user: RequestUser, dto: EditorialEditDto) {
    const blog = await this.assertReviewer(id, user);

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

    return this.prisma.blog.update({
      where: { id },
      data,
      select: BLOG_SELECT,
    });
  }

  async approve(id: string, user: RequestUser) {
    await this.assertReviewer(id, user);

    const [updated] = await this.prisma.$transaction([
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
        },
      }),
    ]);

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_APPROVED',
      entityType: 'Blog',
      entityId: id,
    });

    return updated;
  }

  async reject(id: string, user: RequestUser, dto: EditorialDecisionDto) {
    await this.assertReviewer(id, user);

    const [updated] = await this.prisma.$transaction([
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
        },
      }),
    ]);

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_REJECTED',
      entityType: 'Blog',
      entityId: id,
      metadata: { comment: dto.comment },
    });

    return updated;
  }

  async requestRevision(
    id: string,
    user: RequestUser,
    dto: EditorialDecisionDto,
  ) {
    await this.assertReviewer(id, user);

    const [updated] = await this.prisma.$transaction([
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
        },
      }),
    ]);

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_REVISION_REQUESTED',
      entityType: 'Blog',
      entityId: id,
      metadata: { comment: dto.comment },
    });

    return updated;
  }

  private async assertReviewer(id: string, user: RequestUser) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog not found');

    if (blog.status !== BlogStatus.UNDER_REVIEW) {
      throw new BadRequestException('Blog is not under review');
    }
    if (user.role !== Role.ADMIN && blog.assignedEditorId !== user.id) {
      throw new ForbiddenException(
        'Only the assigned editor or admin can act on this blog',
      );
    }

    return blog;
  }
}
