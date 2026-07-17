import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommentStatus, Role } from '../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { AdminService } from './admin.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import {
  AdminUserQueryDto,
  AdminBlogQueryDto,
  AdminCommentQueryDto,
} from './dto/admin-query.dto';
import {
  ReturnToEditorDto,
  SchedulePublicationDto,
} from './dto/publication.dto';
import { AdminRejectDto } from '../editorial/dto/critical-evaluation.dto';

type RequestUser = { id: string; role: Role };

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
  ) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Post('editors')
  createEditor(@CurrentUser() actor: RequestUser, @Body() dto: CreateStaffDto) {
    return this.adminService.createEditor(actor.id, dto);
  }

  @Post('admins')
  createAdmin(@CurrentUser() actor: RequestUser, @Body() dto: CreateStaffDto) {
    return this.adminService.createAdmin(actor.id, dto);
  }

  @Patch('users/:id/block')
  blockUser(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.blockUser(actor.id, id);
  }

  @Patch('users/:id/unblock')
  unblockUser(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.unblockUser(actor.id, id);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.usersService.deleteUser(actor.id, id);
  }

  @Get('users')
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('blogs')
  listBlogs(@Query() query: AdminBlogQueryDto) {
    return this.adminService.listBlogs(query);
  }

  @Get('publication-queue')
  publicationQueue(@Query() query: AdminBlogQueryDto) {
    return this.adminService.listPublicationQueue(query);
  }

  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    return this.adminService.getArticle(id);
  }

  @Post('blogs/:id/publish')
  publishBlog(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.publishBlog(actor.id, id);
  }

  @Post('blogs/:id/approve')
  approveBlog(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.approveBlog(actor.id, id);
  }

  @Post('blogs/:id/reject')
  rejectBlog(
    @Param('id') id: string,
    @Body() dto: AdminRejectDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.rejectBlog(actor.id, id, dto.reason);
  }

  @Post('blogs/:id/return-to-editor')
  returnToEditor(
    @Param('id') id: string,
    @Body() dto: ReturnToEditorDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.returnToEditor(actor.id, id, dto.note);
  }

  @Post('blogs/:id/schedule')
  scheduleBlog(
    @Param('id') id: string,
    @Body() dto: SchedulePublicationDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.scheduleBlog(actor.id, id, dto.publishAt);
  }

  @Post('blogs/:id/archive')
  archiveBlog(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.archiveBlog(actor.id, id);
  }

  @Post('publications/run-due')
  publishDue(@CurrentUser() actor: RequestUser) {
    return this.adminService.publishDue(actor.id);
  }

  @Post('blogs/:id/unpublish')
  unpublishBlog(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.unpublishBlog(actor.id, id);
  }

  @Delete('blogs/:id')
  deleteBlog(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.deleteBlog(actor.id, id);
  }

  @Get('categories')
  listCategories(@Query() query: AdminUserQueryDto) {
    return this.adminService.listCategories(query);
  }

  @Get('tags')
  listTags(@Query() query: AdminUserQueryDto) {
    return this.adminService.listTags(query);
  }

  @Get('comments')
  listComments(@Query() query: AdminCommentQueryDto) {
    return this.adminService.listComments(query);
  }

  @Patch('comments/:id/hide')
  hideComment(@Param('id') id: string) {
    return this.adminService.moderateComment(id, CommentStatus.HIDDEN);
  }

  @Patch('comments/:id/restore')
  restoreComment(@Param('id') id: string) {
    return this.adminService.moderateComment(id, CommentStatus.VISIBLE);
  }

  @Delete('comments/:id')
  deleteComment(@Param('id') id: string) {
    return this.adminService.deleteComment(id);
  }
}
