import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { CloudinaryService } from './cloudinary.service';
import { MediaCleanupService } from './media-cleanup.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, CloudinaryService, MediaCleanupService],
  exports: [UploadsService, CloudinaryService, MediaCleanupService],
})
export class UploadsModule {}
