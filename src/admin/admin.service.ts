import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BlogStatus,
  CommentStatus,
  Role,
  UserStatus,
} from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import {
  AdminUserQueryDto,
  AdminBlogQueryDto,
  AdminCommentQueryDto,
} from './dto/admin-query.dto';
import { paginate } from '../common/utils/pagination.util';
import { sanitizeBlogHtml } from '../common/utils/sanitize-blog-html';
import { computeReadingStats } from '../common/utils/reading-time';

const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  isDeleted: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const BLOG_LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  status: true,
  publishedAt: true,
  readingTime: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
  assignedEditor: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, slug: true } },
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async getStats() {
    if (!this.prisma.user.groupBy || !this.prisma.blog.groupBy) {
      const [
        totalUsers,
        totalAuthors,
        totalEditors,
        totalAdmins,
        totalBlogs,
        submittedBlogs,
        underReviewBlogs,
        approvedBlogs,
        publishedBlogs,
        rejectedBlogs,
      ] = await Promise.all([
        this.prisma.user.count({ where: { isDeleted: false } }),
        this.prisma.user.count({
          where: { role: Role.AUTHOR, isDeleted: false },
        }),
        this.prisma.user.count({
          where: { role: Role.EDITOR, isDeleted: false },
        }),
        this.prisma.user.count({
          where: { role: Role.ADMIN, isDeleted: false },
        }),
        this.prisma.blog.count(),
        this.prisma.blog.count({ where: { status: BlogStatus.SUBMITTED } }),
        this.prisma.blog.count({ where: { status: BlogStatus.UNDER_REVIEW } }),
        this.prisma.blog.count({ where: { status: BlogStatus.APPROVED } }),
        this.prisma.blog.count({ where: { status: BlogStatus.PUBLISHED } }),
        this.prisma.blog.count({ where: { status: BlogStatus.REJECTED } }),
      ]);

      const stats = {
        users: totalUsers,
        totalUsers,
        authors: totalAuthors,
        totalAuthors,
        editors: totalEditors,
        totalEditors,
        admins: totalAdmins,
        totalAdmins,
        totalBlogs,
        submitted: submittedBlogs,
        submittedBlogs,
        underReview: underReviewBlogs,
        underReviewBlogs,
        approved: approvedBlogs,
        approvedBlogs,
        published: publishedBlogs,
        publishedBlogs,
        rejected: rejectedBlogs,
        rejectedBlogs,
      };

      return {
        ...stats,
        stats,
      };
    }

    const [userGroups, blogGroups] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        where: { isDeleted: false },
        _count: { _all: true },
      }),
      this.prisma.blog.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const usersByRole = Object.fromEntries(
      Object.values(Role).map((role) => [role, 0]),
    ) as Record<Role, number>;
    const blogsByStatus = Object.fromEntries(
      Object.values(BlogStatus).map((status) => [status, 0]),
    ) as Record<BlogStatus, number>;

    for (const item of userGroups) {
      usersByRole[item.role] = item._count._all;
    }
    for (const item of blogGroups) {
      blogsByStatus[item.status] = item._count._all;
    }

    const totalUsers = Object.values(usersByRole).reduce(
      (sum, count) => sum + count,
      0,
    );
    const totalBlogs = Object.values(blogsByStatus).reduce(
      (sum, count) => sum + count,
      0,
    );
    const totalAuthors = usersByRole.AUTHOR;
    const totalEditors = usersByRole.EDITOR;
    const totalAdmins = usersByRole.ADMIN;
    const submittedBlogs = blogsByStatus.SUBMITTED;
    const underReviewBlogs = blogsByStatus.UNDER_REVIEW;
    const approvedBlogs = blogsByStatus.APPROVED;
    const publishedBlogs = blogsByStatus.PUBLISHED;
    const rejectedBlogs = blogsByStatus.REJECTED;

    const stats = {
      users: totalUsers,
      totalUsers,
      authors: totalAuthors,
      totalAuthors,
      editors: totalEditors,
      totalEditors,
      admins: totalAdmins,
      totalAdmins,
      totalBlogs,
      submitted: submittedBlogs,
      submittedBlogs,
      underReview: underReviewBlogs,
      underReviewBlogs,
      approved: approvedBlogs,
      approvedBlogs,
      published: publishedBlogs,
      publishedBlogs,
      rejected: rejectedBlogs,
      rejectedBlogs,
    };

    return {
      ...stats,
      stats,
    };
  }

  async createEditor(actorId: string, dto: CreateStaffDto) {
    return this.createStaff(actorId, dto, Role.EDITOR, 'EDITOR_CREATED');
  }

  async createAdmin(actorId: string, dto: CreateStaffDto) {
    return this.createStaff(actorId, dto, Role.ADMIN, 'ADMIN_CREATED');
  }

  private async createStaff(
    actorId: string,
    dto: CreateStaffDto,
    role: Role,
    action: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role },
      select: USER_SAFE_SELECT,
    });

    await this.audit.log({
      actorId,
      action,
      entityType: 'User',
      entityId: user.id,
    });
    return user;
  }

  async promoteToAuthor(actorId: string, userId: string) {
    const user = await this.findUserOrThrow(userId);

    if (user.role !== Role.USER) {
      throw new BadRequestException('Only USER role can be promoted to AUTHOR');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: Role.AUTHOR },
      select: USER_SAFE_SELECT,
    });

    await this.audit.log({
      actorId,
      action: 'USER_PROMOTED_AUTHOR',
      entityType: 'User',
      entityId: userId,
    });

    return updated;
  }

  async blockUser(actorId: string, userId: string) {
    const user = await this.findUserOrThrow(userId);

    if (user.role === Role.ADMIN) {
      throw new BadRequestException('Cannot block an admin account');
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new BadRequestException('User is already blocked');
    }
    if (user.status === UserStatus.DELETED || user.isDeleted) {
      throw new BadRequestException('Deleted users cannot be blocked');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.BLOCKED },
      select: USER_SAFE_SELECT,
    });

    await this.audit.log({
      actorId,
      action: 'USER_BLOCKED',
      entityType: 'User',
      entityId: userId,
    });

    return updated;
  }

  async unblockUser(actorId: string, userId: string) {
    const user = await this.findUserOrThrow(userId);

    if (user.status === UserStatus.ACTIVE) {
      throw new BadRequestException('User is already active');
    }
    if (user.status === UserStatus.DELETED || user.isDeleted) {
      throw new BadRequestException('Deleted users cannot be unblocked');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
      select: USER_SAFE_SELECT,
    });

    await this.audit.log({
      actorId,
      action: 'USER_UNBLOCKED',
      entityType: 'User',
      entityId: userId,
    });

    return updated;
  }

  async listUsers(query: AdminUserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async listBlogs(query: AdminBlogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

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

  async publishBlog(actorId: string, blogId: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) throw new NotFoundException('Blog not found');

    if (blog.status === BlogStatus.PUBLISHED) {
      throw new ConflictException('Blog is already published');
    }
    const allowedStatuses: BlogStatus[] = [
      BlogStatus.SUBMITTED,
      BlogStatus.UNPUBLISHED,
      BlogStatus.APPROVED,
    ];

    if (!allowedStatuses.includes(blog.status)) {
      throw new BadRequestException(
        'Only SUBMITTED, APPROVED, or UNPUBLISHED blogs can be published',
      );
    }

    const sanitized = sanitizeBlogHtml(blog.content);
    if (!sanitized.trim()) {
      throw new BadRequestException('Blog content is empty after sanitization');
    }
    const { wordCount, readingTime } = computeReadingStats(sanitized);

    const updated = await this.prisma.blog.update({
      where: { id: blogId },
      data: {
        content: sanitized,
        status: BlogStatus.PUBLISHED,
        publishedAt: new Date(),
        wordCount,
        readingTime,
      },
      select: BLOG_LIST_SELECT,
    });

    await this.audit.log({
      actorId,
      action: 'BLOG_PUBLISHED',
      entityType: 'Blog',
      entityId: blogId,
      metadata: {
        oldStatus: blog.status,
        newStatus: BlogStatus.PUBLISHED,
      },
    });

    return updated;
  }

  async unpublishBlog(actorId: string, blogId: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) throw new NotFoundException('Blog not found');

    if (blog.status !== BlogStatus.PUBLISHED) {
      throw new BadRequestException('Only PUBLISHED blogs can be unpublished');
    }

    const updated = await this.prisma.blog.update({
      where: { id: blogId },
      data: { status: BlogStatus.UNPUBLISHED },
      select: BLOG_LIST_SELECT,
    });

    await this.audit.log({
      actorId,
      action: 'BLOG_UNPUBLISHED',
      entityType: 'Blog',
      entityId: blogId,
      metadata: {
        oldStatus: blog.status,
        newStatus: BlogStatus.UNPUBLISHED,
      },
    });

    return updated;
  }

  async deleteBlog(actorId: string, blogId: string) {
    const blog = await this.prisma.blog.findUnique({
      where: { id: blogId },
      select: { id: true, title: true },
    });
    if (!blog) throw new NotFoundException('Blog not found');

    await this.prisma.blog.delete({ where: { id: blogId } });

    await this.audit.log({
      actorId,
      action: 'BLOG_DELETED',
      entityType: 'Blog',
      entityId: blogId,
      metadata: { title: blog.title },
    });

    return { message: 'Blog deleted' };
  }

  async listCategories(query: AdminUserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { blogs: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.category.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async listTags(query: AdminUserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.tag.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
          _count: { select: { blogs: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.tag.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async listComments(query: AdminCommentQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.content = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        select: {
          id: true,
          content: true,
          status: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true } },
          blog: { select: { id: true, title: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async moderateComment(id: string, status: CommentStatus) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    return this.prisma.comment.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async deleteComment(id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    await this.prisma.comment.delete({ where: { id } });
    return { message: 'Comment deleted' };
  }

  private async findUserOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.isDeleted || user.status === UserStatus.DELETED) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
