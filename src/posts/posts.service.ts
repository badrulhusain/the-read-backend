import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPostDto: CreatePostDto & { authorId: string }) {
    const { tags, ...rest } = createPostDto;
    return this.prisma.post.create({
      data: {
        ...rest,
        ...(tags?.length ? {
          tags: {
            create: tags.map((tagName) => ({
              tag: { connectOrCreate: { where: { name: tagName }, create: { name: tagName } } }
            }))
          }
        } : {}),
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

  findBySlug(slug: string) {
    return this.prisma.post.findUnique({
      where: { slug },
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
    const { tags, ...rest } = updatePostDto;
    return this.prisma.post.update({
      where: { id },
      data: {
        ...rest,
        ...(tags !== undefined && {
          tags: {
            deleteMany: {},
            ...(tags.length ? {
              create: tags.map((tagName) => ({
                tag: { connectOrCreate: { where: { name: tagName }, create: { name: tagName } } }
              }))
            } : {})
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
