import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createCommentDto: CreateCommentDto, @Request() req: any) {
    return this.commentsService.create({ ...createCommentDto, authorId: req.user.id });
  }

  @Get()
  findAll() {
    return this.commentsService.findAll();
  }

  @Get('post/:postId')
  findByPost(@Param('postId') postId: string) {
    return this.commentsService.findByPost(postId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateCommentDto: UpdateCommentDto, @Request() req: any) {
    const comment = await this.commentsService.findOne(id);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.author.id !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only edit your own comments');
    }
    return this.commentsService.update(id, updateCommentDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    const comment = await this.commentsService.findOne(id);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.author.id !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own comments');
    }
    return this.commentsService.remove(id);
  }
}
