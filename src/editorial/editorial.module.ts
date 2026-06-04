import { Module } from '@nestjs/common';
import { EditorialController } from './editorial.controller';
import { EditorialService } from './editorial.service';

@Module({
  controllers: [EditorialController],
  providers: [EditorialService],
})
export class EditorialModule {}
