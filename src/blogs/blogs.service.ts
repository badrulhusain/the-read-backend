import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogStatus, Role } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { BlogQueryDto } from './dto/blog-query.dto';
import { generateSlug, makeUniqueSlug } from '../common/utils/slug.util';
import { paginate } from '../common/utils/pagination.util';

const BLOG_LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  coverImage: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const;

const BLOG_DETAIL_SELECT = {
  ...BLOG_LIST_SELECT,
  content: true,
  assignedEditorId: true,
} as const;

type RequestUser = { id: string; role: Role };

const EDITABLE_STATUSES: BlogStatus[] = [
  BlogStatus.DRAFT,
  BlogStatus.REVISION_REQUESTED,
];

@Injectable()
export class BlogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async create(user: RequestUser, dto: CreateBlogDto) {
    const base = generateSlug(dto.title);
    const existing = await this.prisma.blog.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const slugSet = new Set(existing.map((b) => b.slug));
    const slug = makeUniqueSlug(base, slugSet);

    return this.prisma.blog.create({
      data: { ...dto, slug, authorId: user.id },
      select: BLOG_DETAIL_SELECT,
    });
  }

  async update(id: string, user: RequestUser, dto: UpdateBlogDto) {
    const blog = await this.findBlogOrThrow(id);

    if (user.role === Role.ADMIN) {
      // Admin can edit any blog
    } else if (user.role === Role.EDITOR) {
      if (blog.assignedEditorId !== user.id) {
        throw new ForbiddenException('You are not assigned to this blog');
      }
    } else {
      if (blog.authorId !== user.id) {
        throw new ForbiddenException('You can only edit your own blogs');
      }
      if (!EDITABLE_STATUSES.includes(blog.status)) {
        throw new BadRequestException(
          'Blog can only be edited in DRAFT or REVISION_REQUESTED status',
        );
      }
    }

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

    return this.prisma.blog.update({
      where: { id },
      data,
      select: BLOG_DETAIL_SELECT,
    });
  }

  async submit(id: string, user: RequestUser) {
    const blog = await this.findBlogOrThrow(id);

    if (blog.authorId !== user.id) {
      throw new ForbiddenException('You can only submit your own blogs');
    }
    if (!EDITABLE_STATUSES.includes(blog.status)) {
      throw new BadRequestException(
        'Only DRAFT or REVISION_REQUESTED blogs can be submitted',
      );
    }
    if (!blog.title?.trim() || !blog.content?.trim()) {
      throw new BadRequestException(
        'Blog must have a title and content before submitting',
      );
    }

    const updated = await this.prisma.blog.update({
      where: { id },
      data: { status: BlogStatus.SUBMITTED },
      select: BLOG_DETAIL_SELECT,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_SUBMITTED',
      entityType: 'Blog',
      entityId: id,
    });

    return updated;
  }

  async listPublished(query: BlogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      status: BlogStatus.PUBLISHED,
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blog.findMany({
        where,
        select: BLOG_LIST_SELECT,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blog.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async getPublishedBySlug(slug: string) {
    const blog = await this.prisma.blog.findUnique({
      where: { slug },
      select: {
        ...BLOG_DETAIL_SELECT,
        reviews: {
          select: {
            decision: true,
            comment: true,
            createdAt: true,
            editor: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!blog || blog.status !== BlogStatus.PUBLISHED) {
      throw new NotFoundException('Blog not found');
    }

    return blog;
  }

  async listMyBlogs(user: RequestUser, query: BlogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = { authorId: user.id };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blog.findMany({
        where,
        select: BLOG_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blog.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async getMyStats(user: RequestUser) {
    const grouped = await this.prisma.blog.groupBy({
      by: ['status'],
      where: { authorId: user.id },
      _count: { _all: true },
    });

    const byStatus = Object.fromEntries(
      Object.values(BlogStatus).map((status) => [status, 0]),
    ) as Record<BlogStatus, number>;

    for (const item of grouped) {
      byStatus[item.status] = item._count._all;
    }

    return {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      draft: byStatus.DRAFT,
      submitted: byStatus.SUBMITTED,
      underReview: byStatus.UNDER_REVIEW,
      revisionRequested: byStatus.REVISION_REQUESTED,
      approved: byStatus.APPROVED,
      rejected: byStatus.REJECTED,
      published: byStatus.PUBLISHED,
      unpublished: byStatus.UNPUBLISHED,
      archived: byStatus.ARCHIVED,
      byStatus,
    };
  }

  async getMyBlog(id: string, user: RequestUser) {
    const blog = await this.prisma.blog.findFirst({
      where: { id, authorId: user.id },
      select: {
        ...BLOG_DETAIL_SELECT,
        content: true,
        reviews: {
          select: {
            decision: true,
            comment: true,
            createdAt: true,
            editor: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!blog) throw new NotFoundException('Blog not found');
    return blog;
  }

  private async findBlogOrThrow(id: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog not found');
    return blog;
  }
}
