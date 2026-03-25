import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createTagDto: CreateTagDto) {
    return this.prisma.tag.create({ data: createTagDto });
  }

  findAll() {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  findOne(id: string) {
    return this.prisma.tag.findUnique({
      where: { id },
      include: { posts: { include: { post: { select: { id: true, title: true, status: true } } } } },
    });
  }

  update(id: string, updateTagDto: UpdateTagDto) {
    return this.prisma.tag.update({ where: { id }, data: updateTagDto });
  }

  remove(id: string) {
    return this.prisma.tag.delete({ where: { id } });
  }
}
