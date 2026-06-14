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
import { CoverImageDto, UpdateCoverImageDto } from './dto/cover-image.dto';
import { BlogQueryDto } from './dto/blog-query.dto';
import { HistoryQueryDto, TimelineQueryDto } from './dto/history-query.dto';
import { generateSlug, makeUniqueSlug } from '../common/utils/slug.util';
import { paginate } from '../common/utils/pagination.util';
import { sanitizeBlogHtml } from '../common/utils/sanitize-blog-html';
import { computeReadingStats } from '../common/utils/reading-time';

const TAG_SELECT = { id: true, name: true, slug: true } as const;
const CATEGORY_SELECT = { id: true, name: true, slug: true } as const;

const BLOG_LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  coverImage: true,
  coverImagePublicId: true,
  coverImageAltText: true,
  coverImageCrop: true,
  coverImageUploadedById: true,
  status: true,
  publishedAt: true,
  readingTime: true,
  wordCount: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
  category: { select: CATEGORY_SELECT },
  tags: { select: { tag: { select: TAG_SELECT } } },
  _count: { select: { comments: true } },
} as const;

const BLOG_DETAIL_SELECT = {
  ...BLOG_LIST_SELECT,
  content: true,
  seoTitle: true,
  seoDescription: true,
  assignedEditorId: true,
} as const;

const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
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
    this.assertCoverFieldsAllowed(user, dto);

    const { tagIds, categoryId, content, coverImage, ...rest } = dto;

    const sanitized = sanitizeBlogHtml(content);
    if (!sanitized.trim()) {
      throw new BadRequestException('Blog content is empty after sanitization');
    }

    if (categoryId) await this.assertCategoryExists(categoryId);
    if (tagIds?.length) await this.assertTagsExist(tagIds);

    const base = generateSlug(dto.title);
    const existing = await this.prisma.blog.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const slug = makeUniqueSlug(base, new Set(existing.map((b) => b.slug)));

    const { wordCount, readingTime } = computeReadingStats(sanitized);

    const blog = await this.prisma.blog.create({
      data: {
        ...rest,
        content: sanitized,
        slug,
        authorId: user.id,
        wordCount,
        readingTime,
        categoryId: categoryId ?? null,
        ...this.toCoverImageData(coverImage, user.id),
        ...(tagIds?.length
          ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      select: BLOG_DETAIL_SELECT,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_CREATED',
      entityType: 'Blog',
      entityId: blog.id,
    });

    return blog;
  }

  async update(id: string, user: RequestUser, dto: UpdateBlogDto) {
    const blog = await this.findBlogOrThrow(id);
    this.assertCoverFieldsAllowed(user, dto);

    if (user.role === Role.ADMIN) {
      // Admin can edit any blog
    } else if (user.role === Role.EDITOR) {
      const canEditSubmitted = blog.status === BlogStatus.SUBMITTED;
      const canEditAssigned = blog.assignedEditorId === user.id;
      if (!canEditSubmitted && !canEditAssigned) {
        throw new ForbiddenException(
          'You can only edit submitted or assigned blogs',
        );
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

    const { tagIds, categoryId, content, title, coverImage, ...rest } = dto;

    const data: Record<string, unknown> = { ...rest };

    if (coverImage !== undefined) {
      Object.assign(data, this.toCoverImageData(coverImage, user.id));
    }

    if (content !== undefined) {
      const sanitized = sanitizeBlogHtml(content);
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

    if (title !== undefined) {
      data.title = title;
      if (title !== blog.title) {
        const base = generateSlug(title);
        const existing = await this.prisma.blog.findMany({
          where: { slug: { startsWith: base }, NOT: { id } },
          select: { slug: true },
        });
        data.slug = makeUniqueSlug(base, new Set(existing.map((b) => b.slug)));
      }
    }

    if (categoryId !== undefined) {
      if (categoryId) await this.assertCategoryExists(categoryId);
      data.categoryId = categoryId ?? null;
    }

    if (tagIds !== undefined && tagIds.length) {
      await this.assertTagsExist(tagIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (tagIds !== undefined) {
        await tx.blogTag.deleteMany({ where: { blogId: id } });
        if (tagIds.length) {
          await tx.blogTag.createMany({
            data: tagIds.map((tagId) => ({ blogId: id, tagId })),
          });
        }
      }
      return tx.blog.update({
        where: { id },
        data,
        select: BLOG_DETAIL_SELECT,
      });
    });

    return updated;
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

    const isResubmit = blog.status === BlogStatus.REVISION_REQUESTED;

    const updated = await this.prisma.blog.update({
      where: { id },
      data: { status: BlogStatus.SUBMITTED, assignedEditorId: null },
      select: BLOG_DETAIL_SELECT,
    });

    await this.audit.log({
      actorId: user.id,
      action: isResubmit ? 'BLOG_RESUBMITTED' : 'BLOG_SUBMITTED',
      entityType: 'Blog',
      entityId: id,
      metadata: {
        oldStatus: blog.status,
        newStatus: BlogStatus.SUBMITTED,
      },
    });

    return updated;
  }

  async listPublished(query: BlogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { status: BlogStatus.PUBLISHED };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.category = { slug: query.category };
    }

    if (query.tag) {
      where.tags = { some: { tag: { slug: query.tag } } };
    }

    const [data, total] = await Promise.all([
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
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        content: true,
        coverImage: true,
        coverImagePublicId: true,
        coverImageAltText: true,
        coverImageCrop: true,
        coverImageUploadedById: true,
        publishedAt: true,
        readingTime: true,
        wordCount: true,
        seoTitle: true,
        seoDescription: true,
        status: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
        category: { select: CATEGORY_SELECT },
        tags: { select: { tag: { select: TAG_SELECT } } },
        _count: { select: { comments: true } },
      },
    });

    if (!blog || blog.status !== BlogStatus.PUBLISHED) {
      throw new NotFoundException('Blog not found');
    }

    return blog;
  }

  async getRelatedBlogs(slug: string) {
    const blog = await this.prisma.blog.findUnique({
      where: { slug },
      select: { id: true, categoryId: true, status: true },
    });

    if (!blog || blog.status !== BlogStatus.PUBLISHED) {
      throw new NotFoundException('Blog not found');
    }

    const where: Record<string, unknown> = {
      status: BlogStatus.PUBLISHED,
      NOT: { id: blog.id },
    };

    if (blog.categoryId) {
      where.categoryId = blog.categoryId;
    }

    return this.prisma.blog.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        coverImageAltText: true,
        coverImageCrop: true,
        coverImageUploadedById: true,
        publishedAt: true,
        readingTime: true,
        author: { select: { id: true, name: true } },
        category: { select: CATEGORY_SELECT },
      },
      orderBy: { publishedAt: 'desc' },
      take: 3,
    });
  }

  async listMyBlogs(user: RequestUser, query: BlogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = { authorId: user.id };

    const [data, total] = await Promise.all([
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
        reviews: {
          select: {
            decision: true,
            comment: true,
            plagiarismScore: true,
            plagiarismNote: true,
            checklist: true,
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

  async publish(id: string, user: RequestUser) {
    const blog = await this.findBlogOrThrow(id);
    const allowedStatuses: BlogStatus[] = [
      BlogStatus.SUBMITTED,
      BlogStatus.UNPUBLISHED,
    ];

    if (!allowedStatuses.includes(blog.status)) {
      throw new BadRequestException(
        'Only SUBMITTED or UNPUBLISHED blogs can be published',
      );
    }

    const sanitized = sanitizeBlogHtml(blog.content);
    if (!sanitized.trim()) {
      throw new BadRequestException('Blog content is empty after sanitization');
    }
    const { wordCount, readingTime } = computeReadingStats(sanitized);

    const updated = await this.prisma.blog.update({
      where: { id },
      data: {
        content: sanitized,
        status: BlogStatus.PUBLISHED,
        publishedAt: new Date(),
        wordCount,
        readingTime,
      },
      select: BLOG_DETAIL_SELECT,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_PUBLISHED',
      entityType: 'Blog',
      entityId: id,
      metadata: {
        oldStatus: blog.status,
        newStatus: BlogStatus.PUBLISHED,
      },
    });

    return updated;
  }

  async unpublish(id: string, user: RequestUser) {
    const blog = await this.findBlogOrThrow(id);

    if (blog.status !== BlogStatus.PUBLISHED) {
      throw new BadRequestException('Only PUBLISHED blogs can be unpublished');
    }

    const updated = await this.prisma.blog.update({
      where: { id },
      data: { status: BlogStatus.UNPUBLISHED },
      select: BLOG_DETAIL_SELECT,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_UNPUBLISHED',
      entityType: 'Blog',
      entityId: id,
      metadata: {
        oldStatus: blog.status,
        newStatus: BlogStatus.UNPUBLISHED,
      },
    });

    return updated;
  }

  async updateCoverImage(
    id: string,
    user: RequestUser,
    dto: UpdateCoverImageDto,
  ) {
    await this.findBlogOrThrow(id);

    const updated = await this.prisma.blog.update({
      where: { id },
      data: this.toCoverImageData(dto.coverImage, user.id),
      select: BLOG_DETAIL_SELECT,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_COVER_IMAGE_UPDATED',
      entityType: 'Blog',
      entityId: id,
    });

    return updated;
  }

  // ── Phase 3: Review History ───────────────────────────────────────────────

  async getBlogReviews(id: string, user: RequestUser, query: HistoryQueryDto) {
    await this.assertBlogAccess(id, user);

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where = { blogId: id };
    const [data, total] = await Promise.all([
      this.prisma.blogReview.findMany({
        where,
        select: {
          id: true,
          decision: true,
          comment: true,
          plagiarismScore: true,
          plagiarismNote: true,
          checklist: true,
          createdAt: true,
          editor: { select: USER_SAFE_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blogReview.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  // ── Phase 3: Version History ──────────────────────────────────────────────

  async getBlogVersions(id: string, user: RequestUser, query: HistoryQueryDto) {
    await this.assertBlogAccess(id, user);

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where = { blogId: id };
    const [data, total] = await Promise.all([
      this.prisma.blogVersion.findMany({
        where,
        select: {
          id: true,
          versionNumber: true,
          title: true,
          content: true,
          createdAt: true,
          editedBy: { select: USER_SAFE_SELECT },
        },
        orderBy: { versionNumber: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blogVersion.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  // ── Phase 3: Blog Timeline ────────────────────────────────────────────────

  async getBlogTimeline(
    id: string,
    user: RequestUser,
    query: TimelineQueryDto,
  ) {
    await this.assertBlogAccess(id, user);

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where = { entityType: 'Blog', entityId: id };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          metadata: true,
          createdAt: true,
          actor: { select: USER_SAFE_SELECT },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async assertBlogAccess(id: string, user: RequestUser) {
    const blog = await this.prisma.blog.findUnique({
      where: { id },
      select: { id: true, authorId: true, assignedEditorId: true },
    });
    if (!blog) throw new NotFoundException('Blog not found');

    if (user.role === Role.ADMIN) return blog;
    if (blog.authorId === user.id) return blog;
    if (blog.assignedEditorId === user.id) return blog;

    throw new ForbiddenException('You do not have access to this blog');
  }

  private async findBlogOrThrow(id: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog not found');
    return blog;
  }

  private assertCoverFieldsAllowed(
    user: RequestUser,
    dto: Partial<CreateBlogDto>,
  ) {
    const includesCoverChange = dto.coverImage !== undefined;

    if (
      includesCoverChange &&
      user.role !== Role.EDITOR &&
      user.role !== Role.ADMIN
    ) {
      throw new ForbiddenException(
        'Only editors and admins can manage cover images',
      );
    }
  }

  private toCoverImageData(
    coverImage: CoverImageDto | null | undefined,
    uploadedBy: string,
  ): Record<string, unknown> {
    if (coverImage === undefined) return {};

    if (coverImage === null) {
      return {
        coverImage: null,
        coverImagePublicId: null,
        coverImageAltText: null,
        coverImageCrop: null,
        coverImageUploadedById: null,
      };
    }

    const hasUrl = coverImage.url !== undefined;

    return {
      ...(hasUrl ? { coverImage: coverImage.url } : {}),
      ...(coverImage.publicId !== undefined
        ? { coverImagePublicId: coverImage.publicId }
        : {}),
      ...(coverImage.altText !== undefined
        ? { coverImageAltText: coverImage.altText }
        : {}),
      ...(coverImage.crop !== undefined
        ? {
            coverImageCrop:
              coverImage.crop === null
                ? null
                : {
                    ...(coverImage.crop.x !== undefined
                      ? { x: coverImage.crop.x }
                      : {}),
                    ...(coverImage.crop.y !== undefined
                      ? { y: coverImage.crop.y }
                      : {}),
                    ...(coverImage.crop.width !== undefined
                      ? { width: coverImage.crop.width }
                      : {}),
                    ...(coverImage.crop.height !== undefined
                      ? { height: coverImage.crop.height }
                      : {}),
                    ...(coverImage.crop.zoom !== undefined
                      ? { zoom: coverImage.crop.zoom }
                      : {}),
                  },
          }
        : {}),
      ...(hasUrl
        ? { coverImageUploadedById: coverImage.url ? uploadedBy : null }
        : {}),
    };
  }

  private async assertCategoryExists(categoryId: string) {
    const cat = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!cat)
      throw new BadRequestException(`Category not found: ${categoryId}`);
  }

  private async assertTagsExist(tagIds: string[]) {
    const tags = await this.prisma.tag.findMany({
      where: { id: { in: tagIds } },
      select: { id: true },
    });
    if (tags.length !== tagIds.length) {
      throw new BadRequestException('One or more tag IDs are invalid');
    }
  }
}
