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
import { EditorialEditDto } from './dto/editorial-edit.dto';
import { EditorialDecisionDto } from './dto/editorial-note.dto';
import { EditorialQueryDto } from './dto/editorial-query.dto';
import { EditorialService } from './editorial.service';

type RequestUser = { id: string; role: Role };

@Roles(Role.EDITOR, Role.ADMIN)
@Controller('editor')
export class EditorialController {
  constructor(private readonly editorialService: EditorialService) {}

  @Get('stats')
  getStats(@CurrentUser() user: RequestUser) {
    return this.editorialService.getStats(user);
  }

  @Get('submissions')
  listSubmissions(@Query() query: EditorialQueryDto) {
    return this.editorialService.listSubmissions(query);
  }

  @Get('blogs/:id')
  getBlog(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.editorialService.getBlog(id, user);
  }

  @Post('blogs/:id/pick')
  pick(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.editorialService.pick(id, user);
  }

  @Patch('blogs/:id')
  edit(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: EditorialEditDto,
  ) {
    return this.editorialService.edit(id, user, dto);
  }

  @Post('blogs/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.editorialService.approve(id, user);
  }

  @Post('blogs/:id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: EditorialDecisionDto,
  ) {
    return this.editorialService.reject(id, user, dto);
  }

  @Post('blogs/:id/request-revision')
  requestRevision(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: EditorialDecisionDto,
  ) {
    return this.editorialService.requestRevision(id, user, dto);
  }
}
