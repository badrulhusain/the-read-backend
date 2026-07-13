import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogStatus } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { paginate } from '../common/utils/pagination.util';
@Injectable()
export class ReaderService {
  constructor(private readonly prisma: PrismaService) {}
  private async published(blogId: string) {
    const blog = await this.prisma.blog.findFirst({
      where: { id: blogId, status: BlogStatus.PUBLISHED },
      select: { id: true },
    });
    if (!blog) throw new NotFoundException('Published blog not found');
  }
  async save(userId: string, blogId: string) {
    await this.published(blogId);
    return this.prisma.savedBlog.upsert({
      where: { userId_blogId: { userId, blogId } },
      update: {},
      create: { userId, blogId },
    });
  }
  async unsave(userId: string, blogId: string) {
    await this.prisma.savedBlog.deleteMany({ where: { userId, blogId } });
    return { saved: false };
  }
  async listSaved(userId: string, page = 1, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 100);
    page = Math.max(page, 1);
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.savedBlog.findMany({
        where,
        include: {
          blog: {
            include: { category: true, tags: { include: { tag: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.savedBlog.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }
  async report(
    userId: string,
    blogId: string,
    reason: string,
    details?: string,
  ) {
    await this.published(blogId);
    const existing = await this.prisma.blogReport.findFirst({
      where: { userId, blogId, status: 'OPEN' },
    });
    if (existing)
      throw new BadRequestException(
        'You already have an open report for this article',
      );
    return this.prisma.blogReport.create({
      data: { userId, blogId, reason, details },
    });
  }
  async notifications(userId: string, page = 1, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 100);
    page = Math.max(page, 1);
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }
  async readNotification(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Notification not found');
    return { read: true };
  }
}
