import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { BlogQueryDto } from '../blogs/dto/blog-query.dto';
import { DiscoveryService } from './discovery.service';

@Public()
@Controller()
export class DiscoveryController {
  constructor(private readonly service: DiscoveryService) {}

  @Get('series')
  listSeries(@Query() query: BlogQueryDto) {
    return this.service.listSeries(query);
  }

  @Get('series/:slug')
  getSeries(@Param('slug') slug: string) {
    return this.service.getSeries(slug);
  }

  @Get('contributors')
  listContributors(@Query() query: BlogQueryDto) {
    return this.service.listContributors(query);
  }

  @Get('contributors/:id')
  getContributor(@Param('id') id: string) {
    return this.service.getContributor(id);
  }
}
