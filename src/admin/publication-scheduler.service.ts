import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminService } from './admin.service';

@Injectable()
export class PublicationSchedulerService {
  private readonly logger = new Logger(PublicationSchedulerService.name);

  constructor(private readonly adminService: AdminService) {}

  @Cron('* * * * *')
  async publishDue(): Promise<void> {
    const result = await this.adminService.publishDue();
    if (result.processed > 0) {
      this.logger.log(
        JSON.stringify({ event: 'scheduled_publication_run', ...result }),
      );
    }
  }
}
