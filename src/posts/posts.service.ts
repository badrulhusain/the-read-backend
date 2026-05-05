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

  async create(createPostDto: CreatePostDto) {
    const { tagIds, ...rest } = createPostDto;
    const slug = await this.uniqueSlug(rest.title);
    return this.prisma.post.create({
      data: {
        ...rest,
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
      },
    });
    if (!post) throw new NotFoundException(`Post not found`);

    await this.prisma.post.update({ where: { slug }, data: { viewCount: { increment: 1 } } });
    return { ...post, viewCount: post.viewCount + 1 };
  }

 
  async update(id: string, updatePostDto: UpdatePostDto) {
    const { tagIds, ...rest } = updatePostDto;
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
