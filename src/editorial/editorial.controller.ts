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
import { BlogsService } from '../blogs/blogs.service';
import { EditorialEditDto } from './dto/editorial-edit.dto';
import {
  ApproveBlogDto,
  RejectBlogDto,
  RequestRevisionDto,
} from './dto/editorial-note.dto';
import {
  EditorialBlogQueryDto,
  EditorialQueryDto,
} from './dto/editorial-query.dto';
import { EditorialService } from './editorial.service';

type RequestUser = { id: string; role: Role };

@Roles(Role.EDITOR, Role.ADMIN)
@Controller('editorial')
export class EditorialController {
  constructor(
    private readonly editorialService: EditorialService,
    private readonly blogsService: BlogsService,
  ) {}

  @Get('stats')
  getStats(@CurrentUser() user: RequestUser) {
    return this.editorialService.getStats(user);
  }

  @Get('submissions')
  listSubmissions(@Query() query: EditorialQueryDto) {
    return this.editorialService.listSubmissions(query);
  }

  @Get('blogs')
  listBlogs(
    @Query() query: EditorialBlogQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.editorialService.listBlogs(query, user);
  }

  @Get('my-reviews')
  listMyReviews(
    @Query() query: EditorialBlogQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.editorialService.listBlogs(query, user);
  }

  @Get('reviews')
  listReviews(
    @Query() query: EditorialBlogQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.editorialService.listBlogs(query, user);
  }

  @Get('blogs/:id')
  getBlog(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.editorialService.getBlog(id, user);
  }

  @Post('blogs/:id/pick')
  pick(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.editorialService.pick(id, user);
  }

  @Patch('blogs/:id/edit')
  edit(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: EditorialEditDto,
  ) {
    return this.editorialService.edit(id, user, dto);
  }

  @Post('blogs/:id/approve')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ApproveBlogDto,
  ) {
    return this.editorialService.approve(id, user, dto);
  }

  @Post('blogs/:id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RejectBlogDto,
  ) {
    return this.editorialService.reject(id, user, dto);
  }

  @Post('blogs/:id/request-revision')
  requestRevision(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RequestRevisionDto,
  ) {
    return this.editorialService.requestRevision(id, user, dto);
  }

  @Post('blogs/:id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.publish(id, user);
  }

  @Post('blogs/:id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.blogsService.unpublish(id, user);
  }
}
