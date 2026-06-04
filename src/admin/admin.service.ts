import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogStatus, Role, UserStatus } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { AdminUserQueryDto, AdminBlogQueryDto } from './dto/admin-query.dto';
import { paginate } from '../common/utils/pagination.util';

const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
  assignedEditor: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async getStats() {
    const [totalUsers, totalEditors, submittedBlogs, approvedBlogs, publishedBlogs] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { role: Role.EDITOR } }),
        this.prisma.blog.count({ where: { status: BlogStatus.SUBMITTED } }),
        this.prisma.blog.count({ where: { status: BlogStatus.APPROVED } }),
        this.prisma.blog.count({ where: { status: BlogStatus.PUBLISHED } }),
      ]);

    return { totalUsers, totalEditors, submittedBlogs, approvedBlogs, publishedBlogs };
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

    const [data, total] = await this.prisma.$transaction([
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
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

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

  async publishBlog(actorId: string, blogId: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) throw new NotFoundException('Blog not found');

    if (blog.status !== BlogStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED blogs can be published');
    }

    const updated = await this.prisma.blog.update({
      where: { id: blogId },
      data: { status: BlogStatus.PUBLISHED, publishedAt: new Date() },
      select: BLOG_LIST_SELECT,
    });

    await this.audit.log({
      actorId,
      action: 'BLOG_PUBLISHED',
      entityType: 'Blog',
      entityId: blogId,
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
    });

    return updated;
  }

  private async findUserOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
