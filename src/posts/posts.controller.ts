import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, ForbiddenException, HttpCode, HttpStatus } from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createPostDto: CreatePostDto, @Request() req: any) {
    return this.postsService.create({ ...createPostDto, authorId: req.user.id });
  }

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('status') status?: string,
    @Query('tag') tag?: string,
  ) {
    return this.postsService.findAll(+page, +limit, status, tag);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.postsService.findBySlug(slug);
  }

  @Post('slug/:slug/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  async incrementView(@Param('slug') slug: string) {
    await this.postsService.incrementView(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  toggleLike(@Param('id') id: string, @Request() req: any) {
    return this.postsService.toggleLike(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/like-status')
  getLikeStatus(@Param('id') id: string, @Request() req: any) {
    return this.postsService.getLikeStatus(id, req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updatePostDto: UpdatePostDto, @Request() req: any) {
    const post = await this.postsService.findOne(id);
    if (post.authorId !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only the author or an admin can edit this post');
    }
    return this.postsService.update(id, updatePostDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    const post = await this.postsService.findOne(id);
    if (post.authorId !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only the author or an admin can delete this post');
    }
    return this.postsService.remove(id);
  }
}
