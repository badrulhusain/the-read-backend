import { Module } from '@nestjs/common';
import { ReaderController } from './reader.controller';
import { ReaderApiController } from './reader-api.controller';
import { ReaderService } from './reader.service';
@Module({
  controllers: [ReaderController, ReaderApiController],
  providers: [ReaderService],
})
export class ReaderModule {}
