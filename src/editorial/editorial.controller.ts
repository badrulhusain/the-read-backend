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
  EditorialBlogQueryDto,
  EditorialQueryDto,
} from './dto/editorial-query.dto';
import { EditorialService } from './editorial.service';
import {
  CorrectionDto,
  CriticalEvaluationDto,
} from './dto/critical-evaluation.dto';

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

  @Post('blogs/:id/evaluation')
  evaluate(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CriticalEvaluationDto,
  ) {
    return this.editorialService.submitCriticalEvaluation(id, user, dto);
  }

  @Post('blogs/:id/return-for-correction')
  returnForCorrection(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CorrectionDto,
  ) {
    return this.editorialService.returnForCorrection(id, user, dto);
  }

  @Post('blogs/:id/send-to-admin')
  sendToAdmin(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.editorialService.sendToAdmin(id, user);
  }
}
