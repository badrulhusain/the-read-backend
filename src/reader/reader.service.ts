import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogStatus, ReactionType } from '../generated/prisma/client';
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
    await this.prisma.savedBlog.upsert({
      where: { userId_blogId: { userId, blogId } },
      update: {},
      create: { userId, blogId },
    });
    return { saved: true };
  }
  async unsave(userId: string, blogId: string) {
    await this.prisma.savedBlog.deleteMany({ where: { userId, blogId } });
    return { saved: false };
  }
  async listSaved(userId: string, page = 1, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 100);
    page = Math.max(page, 1);
    const where = { userId, blog: { status: BlogStatus.PUBLISHED } };
    const [data, total] = await Promise.all([
      this.prisma.savedBlog.findMany({
        where,
        select: {
          createdAt: true,
          blog: {
            select: {
              id: true,
              title: true,
              slug: true,
              excerpt: true,
              coverImage: true,
              publishedAt: true,
              readingTime: true,
              category: { select: { id: true, name: true, slug: true } },
              tags: {
                select: {
                  tag: { select: { id: true, name: true, slug: true } },
                },
              },
            },
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
  async recordHistory(userId: string, blogId: string) {
    await this.published(blogId);
    await this.prisma.readingHistory.upsert({
      where: { userId_blogId: { userId, blogId } },
      update: { lastReadAt: new Date() },
      create: { userId, blogId },
    });
    return { recorded: true };
  }
  async listHistory(userId: string, page = 1, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 100);
    page = Math.max(page, 1);
    const where = { userId, blog: { status: BlogStatus.PUBLISHED } };
    const [rows, total] = await Promise.all([
      this.prisma.readingHistory.findMany({
        where,
        include: {
          blog: {
            include: { category: true, tags: { include: { tag: true } } },
          },
        },
        orderBy: { lastReadAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.readingHistory.count({ where }),
    ]);
    return paginate(
      rows.map((row) => row.blog),
      total,
      page,
      limit,
    );
  }
  async react(userId: string, blogId: string, type: ReactionType) {
    await this.published(blogId);
    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.blogReaction.createMany({
        data: [{ userId, blogId, type }],
        skipDuplicates: true,
      });
      if (inserted.count === 1) {
        const updated = await tx.blog.updateMany({
          where: { id: blogId, status: BlogStatus.PUBLISHED },
          data: {
            reactionCount: { increment: 1 },
            trendingScore: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new NotFoundException('Published blog not found');
        }
      }
    });
    return this.reactionCounts(blogId);
  }
  async reactionCounts(blogId: string) {
    await this.published(blogId);
    const grouped = await this.prisma.blogReaction.groupBy({
      by: ['type'],
      where: { blogId },
      _count: { _all: true },
    });
    const counts: Record<ReactionType, number> = {
      INSIGHTFUL: 0,
      INSPIRING: 0,
      THOUGHT_PROVOKING: 0,
    };
    for (const item of grouped) counts[item.type] = item._count._all;
    return counts;
  }
  async subscribe(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    await this.prisma.newsletterSubscriber.upsert({
      where: { email: normalizedEmail },
      update: { isActive: true },
      create: { email: normalizedEmail },
    });
    return { subscribed: true };
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
