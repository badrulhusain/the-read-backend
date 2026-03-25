import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPostDto: CreatePostDto) {
    const { tagIds, ...rest } = createPostDto;
    return this.prisma.post.create({
      data: {
        ...rest,
        tags: tagIds
          ? { create: tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) }
          : undefined,
      },
      include: { author: { select: { id: true, name: true, email: true } }, tags: { include: { tag: true } } },
    });
  }

  findAll() {
    return this.prisma.post.findMany({
      include: {
        author: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
        comments: {
          where: { parentId: null },
          include: {
            author: { select: { id: true, name: true } },
            replies: { include: { author: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  update(id: string, updatePostDto: UpdatePostDto) {
    const { tagIds, ...rest } = updatePostDto;
    return this.prisma.post.update({
      where: { id },
      data: {
        ...rest,
        ...(tagIds !== undefined && {
          tags: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })),
          },
        }),
      },
      include: { author: { select: { id: true, name: true, email: true } }, tags: { include: { tag: true } } },
    });
  }

  remove(id: string) {
    return this.prisma.post.delete({ where: { id } });
  }
}
