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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { AdminUserQueryDto, AdminBlogQueryDto } from './dto/admin-query.dto';

type RequestUser = { id: string; role: Role };

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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

  @Patch('users/:id/role')
  promoteToAuthor(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.promoteToAuthor(actor.id, id);
  }

  @Patch('users/:id/block')
  blockUser(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.blockUser(actor.id, id);
  }

  @Patch('users/:id/unblock')
  unblockUser(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.unblockUser(actor.id, id);
  }

  @Get('users')
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('blogs')
  listBlogs(@Query() query: AdminBlogQueryDto) {
    return this.adminService.listBlogs(query);
  }

  @Post('blogs/:id/publish')
  publishBlog(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.publishBlog(actor.id, id);
  }

  @Post('blogs/:id/unpublish')
  unpublishBlog(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.unpublishBlog(actor.id, id);
  }
}
