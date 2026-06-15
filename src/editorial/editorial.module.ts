import { Module } from '@nestjs/common';
import { BlogsModule } from '../blogs/blogs.module';
import { EditorialController } from './editorial.controller';
import { EditorialService } from './editorial.service';

@Module({
  imports: [BlogsModule],
  controllers: [EditorialController],
  providers: [EditorialService],
})
export class EditorialModule {}
