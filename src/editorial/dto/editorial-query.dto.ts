import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BlogStatus } from '../../generated/prisma/client';

export class EditorialQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class EditorialBlogQueryDto extends EditorialQueryDto {
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;
}
