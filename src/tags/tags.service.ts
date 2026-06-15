import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { generateSlug, makeUniqueSlug } from '../common/utils/slug.util';

const PUBLIC_SELECT = { id: true, name: true, slug: true } as const;

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.tag.findMany({
      where: { isActive: true },
      select: PUBLIC_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async listAdmin() {
    return this.prisma.tag.findMany({
      select: {
        ...PUBLIC_SELECT,
        isActive: true,
        createdAt: true,
        _count: { select: { blogs: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateTagDto) {
    const base = generateSlug(dto.name);
    const existing = await this.prisma.tag.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const slug = makeUniqueSlug(base, new Set(existing.map((t) => t.slug)));

    const conflict = await this.prisma.tag.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (conflict) throw new ConflictException('Tag name already exists');

    return this.prisma.tag.create({
      data: {
        name: dto.name,
        slug,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: { ...PUBLIC_SELECT, isActive: true },
    });
  }

  async update(id: string, dto: UpdateTagDto) {
    await this.findOrThrow(id);

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      const base = generateSlug(dto.name);
      const existing = await this.prisma.tag.findMany({
        where: { slug: { startsWith: base }, NOT: { id } },
        select: { slug: true },
      });
      const slug = makeUniqueSlug(base, new Set(existing.map((t) => t.slug)));

      const conflict = await this.prisma.tag.findFirst({
        where: {
          NOT: { id },
          name: { equals: dto.name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (conflict) throw new ConflictException('Tag name already exists');

      data.name = dto.name;
      data.slug = slug;
    }

    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    return this.prisma.tag.update({
      where: { id },
      data,
      select: { ...PUBLIC_SELECT, isActive: true },
    });
  }

  async remove(id: string) {
    await this.findOrThrow(id);

    const blogCount = await this.prisma.blogTag.count({ where: { tagId: id } });
    if (blogCount > 0) {
      await this.prisma.tag.update({
        where: { id },
        data: { isActive: false },
      });
      return { message: `Tag deactivated (used by ${blogCount} blog(s))` };
    }

    await this.prisma.tag.delete({ where: { id } });
    return { message: 'Tag deleted' };
  }

  private async findOrThrow(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }
}
