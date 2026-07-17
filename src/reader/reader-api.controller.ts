import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { NewsletterSubscriptionDto, ReactionDto } from './dto/reader.dto';
import { ReaderService } from './reader.service';

type User = { id: string };

@Controller()
export class ReaderApiController {
  constructor(private readonly service: ReaderService) {}

  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Post('blogs/:blogId/reactions')
  react(
    @CurrentUser() user: User,
    @Param('blogId') blogId: string,
    @Body() dto: ReactionDto,
  ) {
    return this.service.react(user.id, blogId, dto.reaction);
  }

  @Public()
  @Get('blogs/:blogId/reactions')
  reactionCounts(@Param('blogId') blogId: string) {
    return this.service.reactionCounts(blogId);
  }

  @Public()
  @Post('newsletter/subscribe')
  subscribe(@Body() dto: NewsletterSubscriptionDto) {
    return this.service.subscribe(dto.email);
  }
}
