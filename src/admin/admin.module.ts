import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PublicationSchedulerService } from './publication-scheduler.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UsersModule, UploadsModule],
  controllers: [AdminController],
  providers: [AdminService, PublicationSchedulerService],
})
export class AdminModule {}
