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
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AssignEditorDto,
  ChangeSubmissionStatusDto,
  CreateSubmissionDto,
  EmailHistoryDto,
  InternalNoteDto,
  ReviewSubmissionDto,
  SubmissionQueryDto,
} from './dto/submission.dto';
import { SubmissionsService } from './submissions.service';
type Actor = { id: string; role: Role };
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly service: SubmissionsService) {}
  @Public()
  @Post()
  create(@Body() dto: CreateSubmissionDto) {
    return this.service.create(dto);
  }
  @Roles(Role.EDITOR, Role.ADMIN) @Get() list(
    @Query() query: SubmissionQueryDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.service.list(query, actor);
  }
  @Roles(Role.EDITOR, Role.ADMIN) @Get(':id') get(
    @Param('id') id: string,
    @CurrentUser() actor: Actor,
  ) {
    return this.service.get(id, actor);
  }
  @Roles(Role.EDITOR, Role.ADMIN) @Post(':id/article') createArticle(
    @Param('id') id: string,
    @CurrentUser() actor: Actor,
  ) {
    return this.service.createArticle(id, actor);
  }
  @Roles(Role.ADMIN) @Patch(':id/assignment') assign(
    @Param('id') id: string,
    @Body() dto: AssignEditorDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.service.assign(id, dto.editorId, actor);
  }
  @Roles(Role.EDITOR, Role.ADMIN) @Patch(':id/status') status(
    @Param('id') id: string,
    @Body() dto: ChangeSubmissionStatusDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.service.setStatus(id, dto.status, actor);
  }
  @Roles(Role.EDITOR, Role.ADMIN) @Post(':id/notes') note(
    @Param('id') id: string,
    @Body() dto: InternalNoteDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.service.addNote(id, dto.body, actor);
  }
  @Roles(Role.EDITOR, Role.ADMIN) @Post(':id/emails') email(
    @Param('id') id: string,
    @Body() dto: EmailHistoryDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.service.recordEmail(id, dto, actor);
  }
  @Roles(Role.EDITOR, Role.ADMIN) @Post(':id/reviews') review(
    @Param('id') id: string,
    @Body() dto: ReviewSubmissionDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.service.review(id, dto, actor);
  }
}
