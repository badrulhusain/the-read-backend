import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BlogStatus, CommentStatus } from '../../generated/prisma/client';

export class AdminUserQueryDto {
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

  @IsOptional()
  @IsString()
  search?: string;
}

export class AdminBlogQueryDto extends AdminUserQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value || undefined)
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class AdminCommentQueryDto {
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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value || undefined)
  @IsEnum(CommentStatus)
  status?: CommentStatus;
}
