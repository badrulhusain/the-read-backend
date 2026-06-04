import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { CloudinaryService } from './cloudinary.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, CloudinaryService],
})
export class UploadsModule {}
