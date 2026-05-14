import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

function toSlug(title: string, suffix = ''): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return suffix ? `${base}-${suffix}` : base;
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  private async uniqueSlug(title: string): Promise<string> {
    let slug = toSlug(title);
    let existing = await this.prisma.post.findUnique({ where: { slug } });
    let i = 1;
    while (existing) {
      slug = toSlug(title, String(i++));
      existing = await this.prisma.post.findUnique({ where: { slug } });
    }
    return slug;
  }

  async create(createPostDto: CreatePostDto & { authorId: string }) {
    const { tagIds, ...rest } = createPostDto;
    const slug = await this.uniqueSlug(rest.title);
    return this.prisma.post.create({
      data: {
        ...rest,
        content: rest.content ?? '',
        slug,
        tags: tagIds
          ? { create: tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) }
          : undefined,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
      },
    });
  }

  async findAll(page = 1, limit = 10, status?: string, tag?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (tag) where.tags = { some: { tag: { name: tag } } };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, email: true } },
          tags: { include: { tag: true } },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
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
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  async findBySlug(slug: string) {
    const post = await this.prisma.post.findUnique({
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
        _count: { select: { likes: true } },
      },
    });
    if (!post) throw new NotFoundException(`Post not found`);
    return post;
  }

  async incrementView(slug: string) {
    await this.prisma.post.update({ where: { slug }, data: { viewCount: { increment: 1 } } });
  }

  async getLikeStatus(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const [existing, likeCount] = await Promise.all([
      this.prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } }),
      this.prisma.postLike.count({ where: { postId } }),
    ]);
    return { liked: !!existing, likeCount };
  }

  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await this.prisma.postLike.delete({ where: { postId_userId: { postId, userId } } });
    } else {
      await this.prisma.postLike.create({ data: { postId, userId } });
    }

    const likeCount = await this.prisma.postLike.count({ where: { postId } });
    return { liked: !existing, likeCount };
  }

  async update(id: string, updatePostDto: UpdatePostDto) {
    const { tagIds, ...rest } = updatePostDto;
    return this.prisma.post.update({
      where: { id },
      data: {
        ...rest,
        ...(tagIds !== undefined && {
          tags: {
            deleteMany: {},
            ...(tagIds.length ? {
              create: tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })),
            } : {}),
          },
        }),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
      },
    });
  }

  remove(id: string) {
    return this.prisma.post.delete({ where: { id } });
  }
}
