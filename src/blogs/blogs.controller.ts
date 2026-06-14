import {
  Body,
  Controller,
  Get,
  Header,
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
import { UpdateCoverImageDto } from './dto/cover-image.dto';
import { HistoryQueryDto, TimelineQueryDto } from './dto/history-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PUBLIC_CONTENT_CACHE } from '../common/constants/cache-control';

type RequestUser = { id: string; role: Role };

@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Public()
  @Get()
  @Header('Cache-Control', PUBLIC_CONTENT_CACHE)
  listPublished(@Query() query: BlogQueryDto) {
    return this.blogsService.listPublished(query);
  }

  @Get('my')
  listMine(@CurrentUser() user: RequestUser, @Query() query: BlogQueryDto) {
    return this.blogsService.listMyBlogs(user, query);
  }

  @Get('me')
  listMineAlias(
    @CurrentUser() user: RequestUser,
    @Query() query: BlogQueryDto,
  ) {
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

  // ── Phase 3: History endpoints (must be before /:slug) ───────────────────

  @Get(':id/reviews')
  getBlogReviews(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: HistoryQueryDto,
  ) {
    return this.blogsService.getBlogReviews(id, user, query);
  }

  @Get(':id/versions')
  getBlogVersions(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: HistoryQueryDto,
  ) {
    return this.blogsService.getBlogVersions(id, user, query);
  }

  @Get(':id/timeline')
  getBlogTimeline(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: TimelineQueryDto,
  ) {
    return this.blogsService.getBlogTimeline(id, user, query);
  }

  // ── Public slug endpoints (keep after specific routes) ───────────────────

  @Public()
  @Get(':slug/related')
  @Header('Cache-Control', PUBLIC_CONTENT_CACHE)
  getRelated(@Param('slug') slug: string) {
    return this.blogsService.getRelatedBlogs(slug);
  }

  @Public()
  @Get(':slug')
  @Header('Cache-Control', PUBLIC_CONTENT_CACHE)
  getBySlug(@Param('slug') slug: string) {
    return this.blogsService.getPublishedBySlug(slug);
  }

  // ── Write endpoints ───────────────────────────────────────────────────────

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

  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.publish(id, user);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.unpublish(id, user);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/cover-image')
  updateCoverImage(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateCoverImageDto,
  ) {
    return this.blogsService.updateCoverImage(id, user, dto);
  }
}
