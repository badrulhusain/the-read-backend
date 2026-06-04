import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BlogStatus,
  CommentStatus,
  Role,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentQueryDto } from './dto/comment-query.dto';
import { paginate } from '../common/utils/pagination.util';

type RequestUser = { id: string; role: Role; status?: UserStatus };

const COMMENT_USER_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
} as const;

const COMMENT_SELECT = {
  id: true,
  content: true,
  status: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: COMMENT_USER_SELECT },
} as const;

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBlog(slug: string, query: CommentQueryDto) {
    const blog = await this.prisma.blog.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });

    if (!blog || blog.status !== BlogStatus.PUBLISHED) {
      throw new NotFoundException('Blog not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = { blogId: blog.id, status: CommentStatus.VISIBLE };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        select: COMMENT_SELECT,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async create(slug: string, user: RequestUser, dto: CreateCommentDto) {
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('Your account has been blocked');
    }

    const blog = await this.prisma.blog.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });

    if (!blog || blog.status !== BlogStatus.PUBLISHED) {
      throw new NotFoundException('Blog not found');
    }

    const content = dto.content.trim();

    const comment = await this.prisma.comment.create({
      data: {
        blogId: blog.id,
        userId: user.id,
        content,
        status: CommentStatus.VISIBLE,
      },
      select: COMMENT_SELECT,
    });

    return comment;
  }

  async hide(id: string, user: RequestUser) {
    const comment = await this.findOrThrow(id);

    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.EDITOR &&
      comment.userId !== user.id
    ) {
      throw new ForbiddenException('Not authorized');
    }

    return this.prisma.comment.update({
      where: { id },
      data: { status: CommentStatus.HIDDEN },
      select: COMMENT_SELECT,
    });
  }

  async restore(id: string) {
    await this.findOrThrow(id);

    return this.prisma.comment.update({
      where: { id },
      data: { status: CommentStatus.VISIBLE },
      select: COMMENT_SELECT,
    });
  }

  async softDelete(id: string, user: RequestUser) {
    const comment = await this.findOrThrow(id);

    const isOwner = comment.userId === user.id;
    const isModerator = user.role === Role.ADMIN || user.role === Role.EDITOR;

    if (!isOwner && !isModerator) {
      throw new ForbiddenException('Not authorized');
    }

    const newStatus = isModerator
      ? CommentStatus.DELETED
      : CommentStatus.DELETED;

    return this.prisma.comment.update({
      where: { id },
      data: { status: newStatus },
      select: COMMENT_SELECT,
    });
  }

  private async findOrThrow(id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }
}
