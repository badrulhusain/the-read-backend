import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BlogStatus,
  FactCheckStatus,
  Prisma,
  ReviewDecision,
  Role,
  SubmissionStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { sanitizeBlogHtml } from '../common/utils/sanitize-blog-html';
import { computeReadingStats } from '../common/utils/reading-time';
import { generateSlug, makeUniqueSlug } from '../common/utils/slug.util';
import { paginate } from '../common/utils/pagination.util';
import {
  CreateSubmissionDto,
  EmailHistoryDto,
  ReviewSubmissionDto,
  SubmissionQueryDto,
} from './dto/submission.dto';

type Actor = { id: string; role: Role };
const EDITOR_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  RECEIVED: [SubmissionStatus.TRIAGE],
  TRIAGE: [SubmissionStatus.ASSIGNED, SubmissionStatus.REJECTED],
  ASSIGNED: [SubmissionStatus.EDITING],
  EDITING: [SubmissionStatus.NEEDS_RESPONSE, SubmissionStatus.QUALITY_REVIEW],
  NEEDS_RESPONSE: [SubmissionStatus.EDITING, SubmissionStatus.REJECTED],
  QUALITY_REVIEW: [
    SubmissionStatus.READY_FOR_ADMIN,
    SubmissionStatus.NEEDS_RESPONSE,
    SubmissionStatus.REJECTED,
  ],
  READY_FOR_ADMIN: [],
  REJECTED: [],
  PUBLISHED: [],
  ARCHIVED: [],
};

@Injectable()
export class SubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSubmissionDto) {
    const content = sanitizeBlogHtml(dto.content);
    if (!content.trim())
      throw new BadRequestException('Submission content is empty');
    return this.prisma.$transaction(async (tx) => {
      const contributor = await tx.contributor.create({
        data: dto.contributor,
      });
      const submission = await tx.submission.create({
        data: {
          contributorId: contributor.id,
          title: dto.title,
          pitch: dto.pitch,
          content,
        },
        include: { contributor: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'SUBMISSION_RECEIVED',
          entityType: 'Submission',
          entityId: submission.id,
        },
      });
      return submission;
    });
  }

  async list(query: SubmissionQueryDto, actor: Actor) {
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const where: Prisma.SubmissionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.editorId ? { assignedEditorId: query.editorId } : {}),
      ...(actor.role === Role.EDITOR
        ? {
            OR: [
              { assignedEditorId: actor.id },
              {
                status: {
                  in: [SubmissionStatus.RECEIVED, SubmissionStatus.TRIAGE],
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        include: {
          contributor: true,
          assignedEditor: { select: { id: true, name: true, email: true } },
          _count: { select: { reviews: true, notes: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.submission.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async get(id: string, actor: Actor) {
    const item = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        contributor: true,
        assignedEditor: { select: { id: true, name: true, email: true } },
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: { editor: { select: { id: true, name: true } } },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { id: true, name: true } } },
        },
        emails: { orderBy: { sentAt: 'desc' } },
        blog: true,
      },
    });
    if (!item) throw new NotFoundException('Submission not found');
    if (
      actor.role === Role.EDITOR &&
      item.assignedEditorId &&
      item.assignedEditorId !== actor.id
    )
      throw new ForbiddenException('Submission is assigned to another editor');
    return item;
  }

  async createArticle(id: string, actor: Actor) {
    const submission = await this.assertAccess(id, actor);
    if (
      !(<SubmissionStatus[]>[
        SubmissionStatus.RECEIVED,
        SubmissionStatus.TRIAGE,
        SubmissionStatus.ASSIGNED,
      ]).includes(submission.status)
    ) {
      throw new BadRequestException(
        'Only received, triaged, or assigned submissions can become articles',
      );
    }
    const existing = await this.prisma.blog.findUnique({
      where: { submissionId: id },
    });
    if (existing) throw new BadRequestException('Article already exists');
    const base = generateSlug(submission.title);
    const slugs = await this.prisma.blog.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const content = sanitizeBlogHtml(submission.content);
    const stats = computeReadingStats(content);
    return this.prisma.$transaction(async (tx) => {
      const blog = await tx.blog.create({
        data: {
          submissionId: id,
          contributorId: submission.contributorId,
          title: submission.title,
          slug: makeUniqueSlug(base, new Set(slugs.map((item) => item.slug))),
          content,
          status: BlogStatus.EDITING,
          createdById: actor.id,
          authorId: actor.id,
          assignedEditorId: actor.id,
          ...stats,
        },
      });
      await tx.submission.update({
        where: { id },
        data: { status: SubmissionStatus.EDITING, assignedEditorId: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'ARTICLE_CREATED_FROM_SUBMISSION',
          entityType: 'Blog',
          entityId: blog.id,
          metadata: { submissionId: id },
        },
      });
      return blog;
    });
  }

  async assign(id: string, editorId: string, actor: Actor) {
    const editor = await this.prisma.user.findFirst({
      where: {
        id: editorId,
        role: Role.EDITOR,
        status: 'ACTIVE',
        isDeleted: false,
      },
    });
    if (!editor) throw new BadRequestException('Active editor not found');
    return this.change(
      id,
      actor,
      SubmissionStatus.ASSIGNED,
      { assignedEditor: { connect: { id: editorId } } },
      'EDITOR_ASSIGNED',
    );
  }

  async setStatus(id: string, status: SubmissionStatus, actor: Actor) {
    if (
      status === SubmissionStatus.PUBLISHED ||
      status === SubmissionStatus.ARCHIVED
    )
      throw new ForbiddenException(
        'Only an admin publication action can set this status',
      );
    return this.change(id, actor, status, {}, 'SUBMISSION_STATUS_CHANGED');
  }

  async addNote(id: string, body: string, actor: Actor) {
    await this.assertAccess(id, actor);
    return this.prisma.editorialNote.create({
      data: { submissionId: id, authorId: actor.id, body },
    });
  }

  async recordEmail(id: string, dto: EmailHistoryDto, actor: Actor) {
    await this.assertAccess(id, actor);
    return this.prisma.submissionEmail.create({
      data: { submissionId: id, ...dto },
    });
  }

  async review(id: string, dto: ReviewSubmissionDto, actor: Actor) {
    const submission = await this.assertAccess(id, actor);
    if (submission.status !== SubmissionStatus.QUALITY_REVIEW)
      throw new BadRequestException(
        'Only QUALITY_REVIEW submissions can receive a final editorial review',
      );
    if (
      dto.decision === ReviewDecision.READY_FOR_ADMIN &&
      dto.factCheckStatus !== FactCheckStatus.PASSED
    )
      throw new BadRequestException(
        'Fact check must pass before admin approval',
      );
    const nextStatus =
      dto.decision === ReviewDecision.READY_FOR_ADMIN
        ? SubmissionStatus.READY_FOR_ADMIN
        : dto.decision === ReviewDecision.NEEDS_RESPONSE
          ? SubmissionStatus.NEEDS_RESPONSE
          : SubmissionStatus.REJECTED;
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.editorialReview.create({
        data: {
          submissionId: id,
          editorId: actor.id,
          decision: dto.decision,
          summary: dto.summary,
          plagiarismScore: dto.plagiarismScore,
          plagiarismNotes: dto.plagiarismNotes,
          factCheckStatus: dto.factCheckStatus,
          factCheckNotes: dto.factCheckNotes,
          checklist: dto.checklist as Prisma.InputJsonValue,
        },
      });
      await tx.submission.update({
        where: { id },
        data: {
          status: nextStatus,
          plagiarismScore: dto.plagiarismScore,
          factCheckStatus: dto.factCheckStatus,
          editorialChecklist: dto.checklist as Prisma.InputJsonValue,
          reviewedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'EDITORIAL_REVIEW_COMPLETED',
          entityType: 'Submission',
          entityId: id,
          metadata: { reviewId: review.id, status: nextStatus },
        },
      });
      return { review, status: nextStatus };
    });
  }

  private async change(
    id: string,
    actor: Actor,
    status: SubmissionStatus,
    extra: Prisma.SubmissionUpdateInput,
    action: string,
  ) {
    const current = await this.assertAccess(id, actor);
    if (!EDITOR_TRANSITIONS[current.status].includes(status))
      throw new BadRequestException(
        `Invalid transition from ${current.status} to ${status}`,
      );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.submission.update({
        where: { id },
        data: { status, ...extra },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action,
          entityType: 'Submission',
          entityId: id,
          metadata: { oldStatus: current.status, newStatus: status },
        },
      });
      return updated;
    });
  }
  private async assertAccess(id: string, actor: Actor) {
    const item = await this.prisma.submission.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Submission not found');
    if (
      actor.role === Role.EDITOR &&
      item.assignedEditorId &&
      item.assignedEditorId !== actor.id
    )
      throw new ForbiddenException('Submission is assigned to another editor');
    return item;
  }
}
