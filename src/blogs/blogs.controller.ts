import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '../generated/prisma/client';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { UpdateCoverImageDto } from './dto/cover-image.dto';
import { BlogQueryDto } from './dto/blog-query.dto';
import { HistoryQueryDto, TimelineQueryDto } from './dto/history-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PUBLIC_CONTENT_CACHE } from '../common/constants/cache-control';
import {
  AutosaveDraftDto,
  CreateDraftDto,
  CreateSourceDto,
  UpdateRichTextDto,
  UpdateThumbnailMetadataDto,
  UploadThumbnailDto,
  VerifySourceDto,
} from './dto/workflow.dto';

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

  @Roles(Role.EDITOR, Role.ADMIN)
  @Get(':id/reviews')
  getBlogReviews(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: HistoryQueryDto,
  ) {
    return this.blogsService.getBlogReviews(id, user, query);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Get(':id/versions')
  getBlogVersions(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: HistoryQueryDto,
  ) {
    return this.blogsService.getBlogVersions(id, user, query);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Get(':id/timeline')
  getBlogTimeline(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: TimelineQueryDto,
  ) {
    return this.blogsService.getBlogTimeline(id, user, query);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Get(':id/preview')
  preview(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.preview(id, user);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Get(':id/sources')
  listSources(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.listSources(id, user);
  }

  // ── Public slug endpoints (keep after specific routes) ───────────────────

  @Public()
  @Get('featured')
  @Header('Cache-Control', PUBLIC_CONTENT_CACHE)
  featured(@Query() query: BlogQueryDto) {
    return this.blogsService.listPublished(query);
  }

  @Public()
  @Get('trending')
  @Header('Cache-Control', PUBLIC_CONTENT_CACHE)
  trending(@Query() query: BlogQueryDto) {
    return this.blogsService.listTrending(query);
  }

  @Public()
  @Get('id/:id')
  @Header('Cache-Control', PUBLIC_CONTENT_CACHE)
  getPublishedById(@Param('id') id: string) {
    return this.blogsService.getPublishedById(id);
  }

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

  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateBlogDto) {
    return this.blogsService.create(user, dto);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Post('drafts')
  createDraft(@CurrentUser() user: RequestUser, @Body() dto: CreateDraftDto) {
    return this.blogsService.createDraft(user, dto);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/autosave')
  autosave(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AutosaveDraftDto,
  ) {
    return this.blogsService.autosave(id, user, dto);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/content')
  updateRichText(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateRichTextDto,
  ) {
    return this.blogsService.updateRichText(id, user, dto);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/thumbnail')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadThumbnail(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadThumbnailDto,
  ) {
    return this.blogsService.uploadThumbnail(id, user, file, dto);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/thumbnail')
  updateThumbnail(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateThumbnailMetadataDto,
  ) {
    return this.blogsService.updateThumbnail(id, user, dto);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Delete(':id/thumbnail')
  deleteThumbnail(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.deleteThumbnail(id, user);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/sources')
  addSource(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSourceDto,
  ) {
    return this.blogsService.addSource(id, user, dto);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/sources/:sourceId/verify')
  verifySource(
    @Param('id') id: string,
    @Param('sourceId') sourceId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: VerifySourceDto,
  ) {
    return this.blogsService.verifySource(id, sourceId, user, dto);
  }

  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateBlogDto,
  ) {
    return this.blogsService.update(id, user, dto);
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

  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.submit(id, user);
  }
}
