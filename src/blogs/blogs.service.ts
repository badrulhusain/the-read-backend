import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BlogStatus,
  Role,
  SourceVerificationStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { CoverImageDto, UpdateCoverImageDto } from './dto/cover-image.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { BlogQueryDto } from './dto/blog-query.dto';
import { HistoryQueryDto, TimelineQueryDto } from './dto/history-query.dto';
import { generateSlug, makeUniqueSlug } from '../common/utils/slug.util';
import { paginate } from '../common/utils/pagination.util';
import { sanitizeBlogHtml } from '../common/utils/sanitize-blog-html';
import { computeReadingStats } from '../common/utils/reading-time';
import { UploadsService } from '../uploads/uploads.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { UploadType } from '../uploads/dto/upload-image.dto';
import {
  AutosaveDraftDto,
  CreateDraftDto,
  CreateSourceDto,
  UpdateRichTextDto,
  UpdateThumbnailMetadataDto,
  UploadThumbnailDto,
  VerifySourceDto,
} from './dto/workflow.dto';

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
  thumbnail: true,
  status: true,
  publishedAt: true,
  readingTime: true,
  wordCount: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
  contributor: { select: { id: true, name: true, bio: true } },
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
  BlogStatus.NEEDS_CORRECTION,
];

@Injectable()
export class BlogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly uploads: UploadsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(user: RequestUser, dto: CreateBlogDto) {
    const { tagIds, categoryId, content, ...rest } = dto;
    const normalizedCategoryId = this.normalizeOptionalId(categoryId);

    const sanitized = sanitizeBlogHtml(content);
    if (!sanitized.trim()) {
      throw new BadRequestException('Blog content is empty after sanitization');
    }

    if (normalizedCategoryId)
      await this.assertCategoryExists(normalizedCategoryId);
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
        createdById: user.id,
        assignedEditorId: user.role === Role.EDITOR ? user.id : null,
        wordCount,
        readingTime,
        categoryId: normalizedCategoryId,
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

    if (user.role === Role.ADMIN) {
      // Admin can edit any blog
    } else if (user.role === Role.EDITOR) {
      const editableStatuses: BlogStatus[] = [
        BlogStatus.DRAFT,
        BlogStatus.EDITING,
        BlogStatus.QUALITY_REVIEW,
        BlogStatus.NEEDS_CORRECTION,
      ];
      const canEditAssigned =
        blog.assignedEditorId === user.id &&
        editableStatuses.includes(blog.status);
      if (!canEditAssigned) {
        throw new ForbiddenException(
          'You can only edit an assigned article in an editorial status',
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

    const { tagIds, categoryId, content, title, ...rest } = dto;

    const data: Record<string, unknown> = { ...rest };

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
      const normalizedCategoryId = this.normalizeOptionalId(categoryId);
      if (normalizedCategoryId)
        await this.assertCategoryExists(normalizedCategoryId);
      data.categoryId = normalizedCategoryId;
    }

    if (tagIds !== undefined && tagIds.length) {
      await this.assertTagsExist(tagIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.blogVersion.aggregate({
        where: { blogId: id },
        _max: { versionNumber: true },
      });
      await tx.blogVersion.create({
        data: {
          blogId: id,
          title: blog.title,
          excerpt: blog.excerpt,
          content: blog.content,
          seoTitle: blog.seoTitle,
          seoDescription: blog.seoDescription,
          status: blog.status,
          wordCount: blog.wordCount,
          readingTime: blog.readingTime,
          editedById: user.id,
          versionNumber: (latest._max.versionNumber ?? 0) + 1,
          changeNote: 'Major article update',
        },
      });
      if (tagIds !== undefined) {
        await tx.blogTag.deleteMany({ where: { blogId: id } });
        if (tagIds.length) {
          await tx.blogTag.createMany({
            data: tagIds.map((tagId) => ({ blogId: id, tagId })),
          });
        }
      }
      const result = await tx.blog.update({
        where: { id },
        data,
        select: BLOG_DETAIL_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_MAJOR_UPDATE',
          entityType: 'Blog',
          entityId: id,
        },
      });
      return result;
    });

    return updated;
  }

  async submit(id: string, user: RequestUser) {
    const blog = await this.assertEditorialAccess(id, user);
    if (!EDITABLE_STATUSES.includes(blog.status)) {
      throw new BadRequestException(
        'Only DRAFT or NEEDS_CORRECTION articles can enter quality review',
      );
    }
    if (!blog.title?.trim() || !blog.content?.trim()) {
      throw new BadRequestException(
        'Blog must have a title and content before submitting',
      );
    }

    const updated = await this.prisma.blog.update({
      where: { id },
      data: {
        status: BlogStatus.QUALITY_REVIEW,
        assignedEditorId: blog.assignedEditorId ?? user.id,
      },
      select: BLOG_DETAIL_SELECT,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'BLOG_SENT_TO_QUALITY_REVIEW',
      entityType: 'Blog',
      entityId: id,
      metadata: {
        oldStatus: blog.status,
        newStatus: BlogStatus.QUALITY_REVIEW,
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

  async listTrending(query: BlogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = { status: BlogStatus.PUBLISHED };
    const [data, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        select: BLOG_LIST_SELECT,
        orderBy: [{ reactions: { _count: 'desc' } }, { publishedAt: 'desc' }],
        skip: (page - 1) * limit,
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

  async getPublishedById(id: string) {
    const blog = await this.prisma.blog.findFirst({
      where: { id, status: BlogStatus.PUBLISHED },
      select: BLOG_DETAIL_SELECT,
    });
    if (!blog) throw new NotFoundException('Blog not found');
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
      submitted: byStatus.EDITING,
      underReview: byStatus.QUALITY_REVIEW,
      revisionRequested: byStatus.NEEDS_CORRECTION,
      approved: byStatus.READY_FOR_ADMIN,
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
    if (user.role !== Role.ADMIN)
      throw new ForbiddenException('Only admins can publish articles');
    const blog = await this.findBlogOrThrow(id);
    const allowedStatuses: BlogStatus[] = [BlogStatus.READY_FOR_ADMIN];

    if (!allowedStatuses.includes(blog.status)) {
      throw new BadRequestException(
        'Only READY_FOR_ADMIN blogs can be published',
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
    if (user.role !== Role.ADMIN)
      throw new ForbiddenException('Only admins can unpublish articles');
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

  async createDraft(user: RequestUser, dto: CreateDraftDto) {
    const title = dto.title?.trim() || 'Untitled draft';
    const content = dto.content ? sanitizeBlogHtml(dto.content) : '';
    const categoryId = this.normalizeOptionalId(dto.categoryId);
    const contributorId = this.normalizeOptionalId(dto.contributorId);
    if (categoryId) await this.assertCategoryExists(categoryId);
    if (dto.tagIds?.length) await this.assertTagsExist(dto.tagIds);

    const base = generateSlug(title) || 'untitled-draft';
    const existing = await this.prisma.blog.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const slug = makeUniqueSlug(
      base,
      new Set(existing.map((item) => item.slug)),
    );
    const stats = computeReadingStats(content);

    return this.prisma.$transaction(async (tx) => {
      const blog = await tx.blog.create({
        data: {
          title,
          slug,
          content,
          excerpt: dto.excerpt,
          seoTitle: dto.seoTitle,
          seoDescription: dto.seoDescription,
          categoryId,
          contributorId,
          authorId: user.id,
          createdById: user.id,
          assignedEditorId: user.role === Role.EDITOR ? user.id : null,
          status: BlogStatus.DRAFT,
          ...stats,
          ...(dto.tagIds?.length
            ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } }
            : {}),
        },
        select: BLOG_DETAIL_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_DRAFT_CREATED',
          entityType: 'Blog',
          entityId: blog.id,
        },
      });
      return blog;
    });
  }

  async autosave(id: string, user: RequestUser, dto: AutosaveDraftDto) {
    const blog = await this.assertEditorialAccess(id, user);
    if (
      !(<BlogStatus[]>[
        BlogStatus.DRAFT,
        BlogStatus.EDITING,
        BlogStatus.NEEDS_CORRECTION,
      ]).includes(blog.status)
    ) {
      throw new BadRequestException('This article is not autosave-editable');
    }

    const data: Record<string, unknown> = { lastAutosavedAt: new Date() };
    if (dto.title !== undefined) data.title = dto.title.trim() || blog.title;
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt;
    if (dto.seoTitle !== undefined) data.seoTitle = dto.seoTitle;
    if (dto.seoDescription !== undefined)
      data.seoDescription = dto.seoDescription;
    if (dto.content !== undefined) {
      const content = sanitizeBlogHtml(dto.content);
      Object.assign(data, { content, ...computeReadingStats(content) });
    }
    if (dto.categoryId !== undefined) {
      const categoryId = this.normalizeOptionalId(dto.categoryId);
      if (categoryId) await this.assertCategoryExists(categoryId);
      data.categoryId = categoryId;
    }
    if (dto.tagIds !== undefined) await this.assertTagsExist(dto.tagIds);

    return this.prisma.$transaction(async (tx) => {
      if (dto.tagIds !== undefined) {
        await tx.blogTag.deleteMany({ where: { blogId: id } });
        if (dto.tagIds.length) {
          await tx.blogTag.createMany({
            data: dto.tagIds.map((tagId) => ({ blogId: id, tagId })),
          });
        }
      }
      return tx.blog.update({
        where: { id },
        data,
        select: BLOG_DETAIL_SELECT,
      });
    });
  }

  async updateRichText(id: string, user: RequestUser, dto: UpdateRichTextDto) {
    const blog = await this.assertEditorialAccess(id, user);
    const content = sanitizeBlogHtml(dto.content);
    if (!content.trim()) {
      throw new BadRequestException(
        'Article content is empty after sanitization',
      );
    }
    const stats = computeReadingStats(content);

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.blogVersion.aggregate({
        where: { blogId: id },
        _max: { versionNumber: true },
      });
      await tx.blogVersion.create({
        data: {
          blogId: id,
          title: blog.title,
          excerpt: blog.excerpt,
          content: blog.content,
          seoTitle: blog.seoTitle,
          seoDescription: blog.seoDescription,
          status: blog.status,
          wordCount: blog.wordCount,
          readingTime: blog.readingTime,
          editedById: user.id,
          versionNumber: (latest._max.versionNumber ?? 0) + 1,
          changeNote: dto.changeNote ?? 'Rich-text content update',
        },
      });
      const updated = await tx.blog.update({
        where: { id },
        data: { content, ...stats, status: BlogStatus.EDITING },
        select: BLOG_DETAIL_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'BLOG_CONTENT_UPDATED',
          entityType: 'Blog',
          entityId: id,
          metadata: { changeNote: dto.changeNote ?? null },
        },
      });
      return updated;
    });
  }

  async preview(id: string, user: RequestUser) {
    await this.assertEditorialAccess(id, user);
    return this.prisma.blog.findUnique({
      where: { id },
      select: {
        ...BLOG_DETAIL_SELECT,
        sources: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async updateCoverImage(
    id: string,
    user: RequestUser,
    dto: UpdateCoverImageDto,
  ) {
    await this.assertEditorialAccess(id, user);

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

  async uploadThumbnail(
    id: string,
    user: RequestUser,
    file: Express.Multer.File,
    dto: UploadThumbnailDto,
  ) {
    await this.assertEditorialAccess(id, user);
    const uploaded = await this.uploads.uploadImage(
      user,
      file,
      UploadType.BLOG_COVER,
    );
    if (
      uploaded.width < 600 ||
      uploaded.height < 315 ||
      uploaded.width > 6000 ||
      uploaded.height > 6000
    ) {
      await this.cloudinary.delete(uploaded.publicId);
      throw new BadRequestException(
        'Thumbnail dimensions must be between 600x315 and 6000x6000 pixels',
      );
    }

    const previous = await this.prisma.thumbnail.findUnique({
      where: { blogId: id },
      select: { publicId: true },
    });
    try {
      const thumbnail = await this.prisma.$transaction(async (tx) => {
        const result = await tx.thumbnail.upsert({
          where: { blogId: id },
          create: {
            blogId: id,
            url: uploaded.url,
            publicId: uploaded.publicId,
            altText: dto.altText,
            caption: dto.caption,
            width: uploaded.width,
            height: uploaded.height,
            size: uploaded.bytes,
            mimeType: file.mimetype,
            uploadedById: user.id,
          },
          update: {
            url: uploaded.url,
            publicId: uploaded.publicId,
            altText: dto.altText,
            caption: dto.caption,
            crop: undefined,
            width: uploaded.width,
            height: uploaded.height,
            size: uploaded.bytes,
            mimeType: file.mimetype,
            uploadedById: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: previous ? 'THUMBNAIL_REPLACED' : 'THUMBNAIL_UPLOADED',
            entityType: 'Blog',
            entityId: id,
          },
        });
        return result;
      });
      if (previous?.publicId && previous.publicId !== uploaded.publicId) {
        await this.cloudinary.delete(previous.publicId);
      }
      return thumbnail;
    } catch (error) {
      await this.cloudinary.delete(uploaded.publicId);
      throw error;
    }
  }

  async updateThumbnail(
    id: string,
    user: RequestUser,
    dto: UpdateThumbnailMetadataDto,
  ) {
    await this.assertEditorialAccess(id, user);
    const thumbnail = await this.prisma.thumbnail.findUnique({
      where: { blogId: id },
    });
    if (!thumbnail) throw new NotFoundException('Thumbnail not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.thumbnail.update({
        where: { blogId: id },
        data: {
          altText: dto.altText,
          caption: dto.caption,
          crop: dto.crop ? { ...dto.crop } : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'THUMBNAIL_METADATA_UPDATED',
          entityType: 'Blog',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async deleteThumbnail(id: string, user: RequestUser) {
    await this.assertEditorialAccess(id, user);
    const thumbnail = await this.prisma.thumbnail.findUnique({
      where: { blogId: id },
    });
    if (!thumbnail) throw new NotFoundException('Thumbnail not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.thumbnail.delete({ where: { blogId: id } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'THUMBNAIL_DELETED',
          entityType: 'Blog',
          entityId: id,
        },
      });
    });
    await this.cloudinary.delete(thumbnail.publicId);
    return { deleted: true };
  }

  async addSource(id: string, user: RequestUser, dto: CreateSourceDto) {
    await this.assertEditorialAccess(id, user);
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.sourceReference.create({
        data: { blogId: id, ...dto },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'SOURCE_ADDED',
          entityType: 'Blog',
          entityId: id,
          metadata: { sourceId: source.id },
        },
      });
      return source;
    });
  }

  async listSources(id: string, user: RequestUser) {
    await this.assertEditorialAccess(id, user);
    return this.prisma.sourceReference.findMany({
      where: { blogId: id },
      include: { verifiedBy: { select: USER_SAFE_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async verifySource(
    id: string,
    sourceId: string,
    user: RequestUser,
    dto: VerifySourceDto,
  ) {
    await this.assertEditorialAccess(id, user);
    const source = await this.prisma.sourceReference.findFirst({
      where: { id: sourceId, blogId: id },
    });
    if (!source) throw new NotFoundException('Source not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sourceReference.update({
        where: { id: sourceId },
        data: {
          verificationStatus: SourceVerificationStatus.VERIFIED,
          verifiedById: user.id,
          verifiedAt: new Date(),
          note: dto.note ?? source.note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'SOURCE_VERIFIED',
          entityType: 'Blog',
          entityId: id,
          metadata: { sourceId },
        },
      });
      return updated;
    });
  }

  // ── Phase 3: Review History ───────────────────────────────────────────────

  async getBlogReviews(id: string, user: RequestUser, query: HistoryQueryDto) {
    await this.assertBlogAccess(id, user);

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where = { blogId: id };
    const [data, total] = await Promise.all([
      this.prisma.editorialReview.findMany({
        where,
        select: {
          id: true,
          contentQualityScore: true,
          grammarStatus: true,
          readabilityScore: true,
          plagiarismScore: true,
          plagiarismNotes: true,
          factCheckStatus: true,
          factCheckNotes: true,
          sourceVerificationStatus: true,
          headlineQuality: true,
          introductionQuality: true,
          structureQuality: true,
          conclusionQuality: true,
          seoReadiness: true,
          thumbnailQuality: true,
          copyrightConfirmed: true,
          recommendation: true,
          internalNotes: true,
          requiredCorrections: true,
          checklist: true,
          createdAt: true,
          editor: { select: USER_SAFE_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.editorialReview.count({ where }),
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
          excerpt: true,
          content: true,
          seoTitle: true,
          seoDescription: true,
          status: true,
          wordCount: true,
          readingTime: true,
          changeNote: true,
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

  private async assertEditorialAccess(id: string, user: RequestUser) {
    const blog = await this.findBlogOrThrow(id);
    if (user.role === Role.ADMIN) return blog;
    if (
      user.role === Role.EDITOR &&
      (blog.createdById === user.id || blog.assignedEditorId === user.id)
    ) {
      return blog;
    }
    throw new ForbiddenException(
      'You do not have editorial access to this article',
    );
  }

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

  private normalizeOptionalId(value: string | null | undefined): string | null {
    return value?.trim() || null;
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
        ? { coverImageCrop: coverImage.crop }
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
