import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createCommentDto: CreateCommentDto) {
    return this.prisma.comment.create({
      data: createCommentDto,
      include: { author: { select: { id: true, name: true } } },
    });
  }

  findAll() {
    return this.prisma.comment.findMany({
      where: { parentId: null },
      include: {
        author: { select: { id: true, name: true } },
        replies: { include: { author: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.comment.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true } },
        post: { select: { id: true, title: true } },
        replies: { include: { author: { select: { id: true, name: true } } } },
      },
    });
  }

  findByPost(postId: string) {
    return this.prisma.comment.findMany({
      where: { postId, parentId: null },
      include: {
        author: { select: { id: true, name: true } },
        replies: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  update(id: string, updateCommentDto: UpdateCommentDto) {
    return this.prisma.comment.update({
      where: { id },
      data: updateCommentDto,
      include: { author: { select: { id: true, name: true } } },
    });
  }

  remove(id: string) {
    return this.prisma.comment.delete({ where: { id } });
  }
}
