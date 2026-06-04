import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class EditorialApproveDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  comment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  plagiarismScore?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  plagiarismNote?: string;

  @IsOptional()
  @IsObject()
  checklist?: Record<string, unknown>;
}

export class EditorialDecisionDto {
  @IsString()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  comment!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  plagiarismScore?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  plagiarismNote?: string;

  @IsOptional()
  @IsObject()
  checklist?: Record<string, unknown>;
}

export class ApproveBlogDto extends EditorialApproveDto {}
export class RejectBlogDto extends EditorialDecisionDto {}
export class RequestRevisionDto extends EditorialDecisionDto {}
