import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PUBLIC_TAXONOMY_CACHE } from '../common/constants/cache-control';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @Header('Cache-Control', PUBLIC_TAXONOMY_CACHE)
  list() {
    return this.categoriesService.list();
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Get('admin')
  listAdmin() {
    return this.categoriesService.listAdmin();
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
