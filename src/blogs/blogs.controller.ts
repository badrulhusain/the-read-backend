import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { BlogQueryDto } from './dto/blog-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';

type RequestUser = { id: string; role: Role };

@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Public()
  @Get()
  listPublished(@Query() query: BlogQueryDto) {
    return this.blogsService.listPublished(query);
  }

  @Get('my')
  listMine(@CurrentUser() user: RequestUser, @Query() query: BlogQueryDto) {
    return this.blogsService.listMyBlogs(user, query);
  }

  @Get('me')
  listMineAlias(@CurrentUser() user: RequestUser, @Query() query: BlogQueryDto) {
    return this.blogsService.listMyBlogs(user, query);
  }

  @Get('me/stats')
  getMyStats(@CurrentUser() user: RequestUser) {
    return this.blogsService.getMyStats(user);
  }

  @Get('my/:id')
  getMyBlog(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.getMyBlog(id, user);
  }

  @Get('me/:id')
  getMyBlogAlias(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.getMyBlog(id, user);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.blogsService.getPublishedBySlug(slug);
  }

  @Roles(Role.USER, Role.AUTHOR, Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateBlogDto) {
    return this.blogsService.create(user, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateBlogDto,
  ) {
    return this.blogsService.update(id, user, dto);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.submit(id, user);
  }
}
