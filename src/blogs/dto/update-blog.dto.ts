import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { CreateBlogDto } from './create-blog.dto';

export class UpdateBlogDto extends PartialType(CreateBlogDto) {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revision!: number;
}
