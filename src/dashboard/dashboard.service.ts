import { Injectable } from '@nestjs/common';
import { BlogStatus, ReviewDecision, Role } from '../generated/prisma/client';
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
    if (!this.prisma.blog.groupBy) {
      const [
        drafts,
        submitted,
        underReview,
        revisionRequested,
        approved,
        published,
        rejected,
        recentBlogs,
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
        this.prisma.blog.findMany({
          where: { authorId: user.id },
          select: RECENT_BLOG_SELECT,
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
      ]);

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

    const [grouped, recentBlogs] = await Promise.all([
      this.prisma.blog.groupBy({
        by: ['status'],
        where: { authorId: user.id },
        _count: { _all: true },
      }),
      this.prisma.blog.findMany({
        where: { authorId: user.id },
        select: RECENT_BLOG_SELECT,
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ]);

    const byStatus = Object.fromEntries(
      Object.values(BlogStatus).map((status) => [status, 0]),
    ) as Record<BlogStatus, number>;

    for (const item of grouped) {
      byStatus[item.status] = item._count._all;
    }

    return {
      stats: {
        drafts: byStatus.DRAFT,
        submitted: byStatus.SUBMITTED,
        underReview: byStatus.UNDER_REVIEW,
        revisionRequested: byStatus.REVISION_REQUESTED,
        approved: byStatus.APPROVED,
        published: byStatus.PUBLISHED,
        rejected: byStatus.REJECTED,
      },
      recentBlogs,
    };
  }

  async getEditorDashboard(user: RequestUser) {
    if (!this.prisma.blogReview.groupBy) {
      const [
        submittedQueue,
        assignedToMe,
        approvedByMe,
        rejectedByMe,
        revisionRequestedByMe,
        recentAssigned,
      ] = await Promise.all([
        this.prisma.blog.count({ where: { status: BlogStatus.SUBMITTED } }),
        this.prisma.blog.count({
          where: { assignedEditorId: user.id, status: BlogStatus.UNDER_REVIEW },
        }),
        this.prisma.blogReview.count({
          where: { editorId: user.id, decision: ReviewDecision.APPROVED },
        }),
        this.prisma.blogReview.count({
          where: { editorId: user.id, decision: ReviewDecision.REJECTED },
        }),
        this.prisma.blogReview.count({
          where: {
            editorId: user.id,
            decision: ReviewDecision.REVISION_REQUESTED,
          },
        }),
        this.prisma.blog.findMany({
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
        }),
      ]);

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

    const [submittedQueue, assignedToMe, reviewGroups, recentAssigned] =
      await Promise.all([
        this.prisma.blog.count({ where: { status: BlogStatus.SUBMITTED } }),
        this.prisma.blog.count({
          where: { assignedEditorId: user.id, status: BlogStatus.UNDER_REVIEW },
        }),
        this.prisma.blogReview.groupBy({
          by: ['decision'],
          where: { editorId: user.id },
          _count: { _all: true },
        }),
        this.prisma.blog.findMany({
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
        }),
      ]);

    const reviewsByDecision = Object.fromEntries(
      Object.values(ReviewDecision).map((decision) => [decision, 0]),
    ) as Record<ReviewDecision, number>;

    for (const item of reviewGroups) {
      reviewsByDecision[item.decision] = item._count._all;
    }

    return {
      stats: {
        submittedQueue,
        assignedToMe,
        approvedByMe: reviewsByDecision.APPROVED,
        rejectedByMe: reviewsByDecision.REJECTED,
        revisionRequestedByMe: reviewsByDecision.REVISION_REQUESTED,
      },
      recentAssigned,
    };
  }

  async getAdminDashboard() {
    if (!this.prisma.user.groupBy || !this.prisma.blog.groupBy) {
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
        recentBlogs,
        recentActivity,
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
        this.prisma.blog.findMany({
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
        }),
        this.prisma.auditLog.findMany({
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
        }),
      ]);

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

    const [userGroups, blogGroups, recentBlogs, recentActivity] =
      await Promise.all([
        this.prisma.user.groupBy({
          by: ['role'],
          _count: { _all: true },
        }),
        this.prisma.blog.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.blog.findMany({
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
        }),
        this.prisma.auditLog.findMany({
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

    const users = Object.values(usersByRole).reduce(
      (sum, count) => sum + count,
      0,
    );
    const totalBlogs = Object.values(blogsByStatus).reduce(
      (sum, count) => sum + count,
      0,
    );
    const authors = usersByRole.AUTHOR;
    const editors = usersByRole.EDITOR;
    const admins = usersByRole.ADMIN;
    const submitted = blogsByStatus.SUBMITTED;
    const underReview = blogsByStatus.UNDER_REVIEW;
    const approved = blogsByStatus.APPROVED;
    const published = blogsByStatus.PUBLISHED;
    const rejected = blogsByStatus.REJECTED;

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
