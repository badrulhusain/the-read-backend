import { Injectable } from '@nestjs/common';
import { BlogStatus, Role } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

type RequestUser = { id: string; role: Role };

const RECENT_BLOG_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  status: true,
  updatedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserDashboard(user: RequestUser) {
    const [
      drafts,
      submitted,
      underReview,
      revisionRequested,
      approved,
      published,
      rejected,
    ] = await Promise.all([
      this.prisma.blog.count({
        where: { authorId: user.id, status: BlogStatus.DRAFT },
      }),
      this.prisma.blog.count({
        where: { authorId: user.id, status: BlogStatus.SUBMITTED },
      }),
      this.prisma.blog.count({
        where: { authorId: user.id, status: BlogStatus.UNDER_REVIEW },
      }),
      this.prisma.blog.count({
        where: { authorId: user.id, status: BlogStatus.REVISION_REQUESTED },
      }),
      this.prisma.blog.count({
        where: { authorId: user.id, status: BlogStatus.APPROVED },
      }),
      this.prisma.blog.count({
        where: { authorId: user.id, status: BlogStatus.PUBLISHED },
      }),
      this.prisma.blog.count({
        where: { authorId: user.id, status: BlogStatus.REJECTED },
      }),
    ]);

    const recentBlogs = await this.prisma.blog.findMany({
      where: { authorId: user.id },
      select: RECENT_BLOG_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    return {
      stats: {
        drafts,
        submitted,
        underReview,
        revisionRequested,
        approved,
        published,
        rejected,
      },
      recentBlogs,
    };
  }

  async getEditorDashboard(user: RequestUser) {
    const [submittedQueue, assignedToMe] = await Promise.all([
      this.prisma.blog.count({ where: { status: BlogStatus.SUBMITTED } }),
      this.prisma.blog.count({
        where: { assignedEditorId: user.id, status: BlogStatus.UNDER_REVIEW },
      }),
    ]);

    const [approvedByMe, rejectedByMe, revisionRequestedByMe] =
      await Promise.all([
        this.prisma.blogReview.count({
          where: { editorId: user.id, decision: 'APPROVED' },
        }),
        this.prisma.blogReview.count({
          where: { editorId: user.id, decision: 'REJECTED' },
        }),
        this.prisma.blogReview.count({
          where: { editorId: user.id, decision: 'REVISION_REQUESTED' },
        }),
      ]);

    const recentAssigned = await this.prisma.blog.findMany({
      where: { assignedEditorId: user.id, status: BlogStatus.UNDER_REVIEW },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        updatedAt: true,
        author: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    return {
      stats: {
        submittedQueue,
        assignedToMe,
        approvedByMe,
        rejectedByMe,
        revisionRequestedByMe,
      },
      recentAssigned,
    };
  }

  async getAdminDashboard() {
    const [
      users,
      authors,
      editors,
      admins,
      totalBlogs,
      submitted,
      underReview,
      approved,
      published,
      rejected,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.AUTHOR } }),
      this.prisma.user.count({ where: { role: Role.EDITOR } }),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
      this.prisma.blog.count(),
      this.prisma.blog.count({ where: { status: BlogStatus.SUBMITTED } }),
      this.prisma.blog.count({ where: { status: BlogStatus.UNDER_REVIEW } }),
      this.prisma.blog.count({ where: { status: BlogStatus.APPROVED } }),
      this.prisma.blog.count({ where: { status: BlogStatus.PUBLISHED } }),
      this.prisma.blog.count({ where: { status: BlogStatus.REJECTED } }),
    ]);

    const recentBlogs = await this.prisma.blog.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        updatedAt: true,
        author: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    const recentActivity = await this.prisma.auditLog.findMany({
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      stats: {
        users,
        totalUsers: users,
        authors,
        totalAuthors: authors,
        editors,
        totalEditors: editors,
        admins,
        totalAdmins: admins,
        totalBlogs,
        submitted,
        submittedBlogs: submitted,
        underReview,
        underReviewBlogs: underReview,
        approved,
        approvedBlogs: approved,
        published,
        publishedBlogs: published,
        rejected,
        rejectedBlogs: rejected,
      },
      recentBlogs,
      recentActivity,
    };
  }
}
