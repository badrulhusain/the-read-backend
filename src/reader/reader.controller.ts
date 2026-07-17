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
import { Role } from '../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportBlogDto } from './dto/reader.dto';
import { ReaderService } from './reader.service';
type User = { id: string };
@Roles(Role.USER, Role.EDITOR, Role.ADMIN)
@Controller('me')
export class ReaderController {
  constructor(private readonly service: ReaderService) {}
  @Post('saved-blogs/:blogId') save(
    @CurrentUser() user: User,
    @Param('blogId') id: string,
  ) {
    return this.service.save(user.id, id);
  }
  @Delete('saved-blogs/:blogId') unsave(
    @CurrentUser() user: User,
    @Param('blogId') id: string,
  ) {
    return this.service.unsave(user.id, id);
  }
  @Get('saved-blogs') saved(
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.listSaved(user.id, page, limit);
  }
  @Get('history') history(
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.listHistory(user.id, page, limit);
  }
  @Post('history/:blogId') recordHistory(
    @CurrentUser() user: User,
    @Param('blogId') id: string,
  ) {
    return this.service.recordHistory(user.id, id);
  }
  @Post('reports/:blogId') report(
    @CurrentUser() user: User,
    @Param('blogId') id: string,
    @Body() dto: ReportBlogDto,
  ) {
    return this.service.report(user.id, id, dto.reason, dto.details);
  }
  @Get('notifications') notifications(
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.notifications(user.id, page, limit);
  }
  @Patch('notifications/:id/read') read(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.service.readNotification(user.id, id);
  }
}
