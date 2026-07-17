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
} from '@nestjs/common';
import { Role, UserStatus } from '../generated/prisma/client';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentQueryDto } from './dto/comment-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PUBLIC_COMMENTS_CACHE } from '../common/constants/cache-control';

type RequestUser = { id: string; role: Role; status?: UserStatus };

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // Public: list visible comments for a published blog
  @Public()
  @Get('blogs/:slug/comments')
  @Header('Cache-Control', PUBLIC_COMMENTS_CACHE)
  listForBlog(@Param('slug') slug: string, @Query() query: CommentQueryDto) {
    return this.commentsService.listForBlog(slug, query);
  }

  // Protected: post a comment on a published blog
  @Post('blogs/:slug/comments')
  create(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(slug, user, dto);
  }

  @Patch('comments/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.update(id, user, dto);
  }

  // Protected: soft-delete own comment; admin/editor can delete any
  @Delete('comments/:id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.commentsService.softDelete(id, user);
  }

  // Admin/Editor: hide a comment
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch('comments/:id/hide')
  hide(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.commentsService.hide(id, user);
  }

  // Admin/Editor: restore a hidden comment
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch('comments/:id/restore')
  restore(@Param('id') id: string) {
    return this.commentsService.restore(id);
  }
}
