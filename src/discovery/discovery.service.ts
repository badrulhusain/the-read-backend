import { Injectable, NotFoundException } from '@nestjs/common';
import { BlogStatus } from '../generated/prisma/client';
import { BlogQueryDto } from '../blogs/dto/blog-query.dto';
import { paginate } from '../common/utils/pagination.util';
import { PrismaService } from '../database/prisma.service';

const PUBLIC_BLOG_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  coverImage: true,
  coverImageAltText: true,
  status: true,
  publishedAt: true,
  readingTime: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
  contributor: { select: { id: true, name: true, bio: true } },
  category: { select: { id: true, name: true, slug: true } },
  tags: {
    select: { tag: { select: { id: true, name: true, slug: true } } },
  },
} as const;

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async listSeries(query: BlogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = {
      isActive: true,
      blogs: { some: { status: BlogStatus.PUBLISHED } },
    };
    const [rows, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          _count: { select: { blogs: true } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.category.count({ where }),
    ]);
    return paginate(
      rows.map(({ _count, ...series }) => ({
        ...series,
        articleCount: _count.blogs,
      })),
      total,
      page,
      limit,
    );
  }

  async getSeries(slug: string) {
    const series = await this.prisma.category.findFirst({
      where: { slug, isActive: true },
      select: { id: true, name: true, slug: true, description: true },
    });
    if (!series) throw new NotFoundException('Series not found');
    const articles = await this.prisma.blog.findMany({
      where: { categoryId: series.id, status: BlogStatus.PUBLISHED },
      select: PUBLIC_BLOG_SELECT,
      orderBy: { publishedAt: 'desc' },
    });
    return { ...series, articleCount: articles.length, articles };
  }

  async listContributors(query: BlogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = { blogs: { some: { status: BlogStatus.PUBLISHED } } };
    const [rows, total] = await Promise.all([
      this.prisma.contributor.findMany({
        where,
        select: {
          id: true,
          name: true,
          bio: true,
          organization: true,
          websiteUrl: true,
          _count: { select: { blogs: true } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contributor.count({ where }),
    ]);
    return paginate(
      rows.map(({ bio, _count, ...contributor }) => ({
        ...contributor,
        slug: contributor.id,
        biography: bio,
        articleCount: _count.blogs,
      })),
      total,
      page,
      limit,
    );
  }

  async getContributor(id: string) {
    const contributor = await this.prisma.contributor.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        bio: true,
        organization: true,
        websiteUrl: true,
        blogs: {
          where: { status: BlogStatus.PUBLISHED },
          select: PUBLIC_BLOG_SELECT,
          orderBy: { publishedAt: 'desc' },
        },
      },
    });
    if (!contributor) throw new NotFoundException('Contributor not found');
    const { bio, blogs, ...profile } = contributor;
    return {
      ...profile,
      slug: profile.id,
      biography: bio,
      articleCount: blogs.length,
      articles: blogs,
    };
  }
}
