import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
import {
  ApproveBlogDto,
  RejectBlogDto,
  RequestRevisionDto,
} from './dto/editorial-note.dto';
import {
  AssignEditorDto,
  SaveEditorialReviewDto,
} from './dto/editorial-workflow.dto';
import { AutosaveDraftDto, CreateDraftDto } from '../blogs/dto/workflow.dto';

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

  @Get('articles/my-work')
  listMyWork(
    @Query() query: EditorialBlogQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.editorialService.listMyWork(query, user);
  }

  @Post('articles')
  createDraft(@CurrentUser() user: RequestUser, @Body() dto: CreateDraftDto) {
    return this.blogsService.createDraft(user, dto);
  }

  @Patch('articles/:id/autosave')
  autosaveDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AutosaveDraftDto,
  ) {
    return this.blogsService.autosave(id, user, dto);
  }

  @Get('blogs/:id')
  getBlog(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.editorialService.getBlog(id, user);
  }

  @Post('blogs/:id/pick')
  pick(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.editorialService.pick(id, user);
  }

  @Post('blogs/:id/assign')
  assign(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AssignEditorDto,
  ) {
    return this.editorialService.assign(id, user, dto.editorId);
  }

  @Patch('blogs/:id/review')
  saveReview(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SaveEditorialReviewDto,
  ) {
    return this.editorialService.saveReview(id, user, dto);
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

  @Put('articles/:id/evaluation')
  evaluateArticleAlias(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CriticalEvaluationDto,
  ) {
    return this.editorialService.submitCriticalEvaluation(id, user, dto);
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

  @Post('articles/:id/quality-review/complete')
  completeQualityReview(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.editorialService.completeQualityReview(id, user);
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

  @Post('articles/:id/send-to-admin')
  sendArticleToAdminAlias(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.editorialService.sendToAdmin(id, user);
  }
}
