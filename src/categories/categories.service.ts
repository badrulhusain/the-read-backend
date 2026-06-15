import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { generateSlug, makeUniqueSlug } from '../common/utils/slug.util';

const PUBLIC_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
} as const;

const ADMIN_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { blogs: true } },
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      select: PUBLIC_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async listAdmin() {
    return this.prisma.category.findMany({
      select: ADMIN_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateCategoryDto) {
    const slug = await this.buildUniqueSlug(dto.name, null);

    const existing = await this.prisma.category.findFirst({
      where: {
        OR: [{ name: { equals: dto.name, mode: 'insensitive' } }, { slug }],
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Category name already exists');

    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description ?? null,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: { ...PUBLIC_SELECT, isActive: true },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOrThrow(id);

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      const slug = await this.buildUniqueSlug(dto.name, id);
      const conflict = await this.prisma.category.findFirst({
        where: {
          NOT: { id },
          OR: [{ name: { equals: dto.name, mode: 'insensitive' } }, { slug }],
        },
        select: { id: true },
      });
      if (conflict) throw new ConflictException('Category name already exists');
      data.name = dto.name;
      data.slug = slug;
    }

    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    return this.prisma.category.update({
      where: { id },
      data,
      select: { ...PUBLIC_SELECT, isActive: true },
    });
  }

  async remove(id: string) {
    await this.findOrThrow(id);

    const blogCount = await this.prisma.blog.count({
      where: { categoryId: id },
    });

    if (blogCount > 0) {
      await this.prisma.category.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        message: `Category deactivated (${blogCount} blog(s) still assigned)`,
      };
    }

    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted' };
  }

  private async findOrThrow(id: string) {
    const cat = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  private async buildUniqueSlug(name: string, excludeId: string | null) {
    const base = generateSlug(name);
    const existing = await this.prisma.category.findMany({
      where: {
        slug: { startsWith: base },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { slug: true },
    });
    return makeUniqueSlug(base, new Set(existing.map((c) => c.slug)));
  }
}
