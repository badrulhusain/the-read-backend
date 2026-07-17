import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AssignEditorDto {
  @IsUUID()
  editorId!: string;
}

export class SaveEditorialReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  internalNotes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  plagiarismScore?: number | null;

  @IsOptional()
  @IsBoolean()
  plagiarismReviewed?: boolean;

  @IsOptional()
  @IsBoolean()
  factCheckComplete?: boolean;

  @IsOptional()
  @IsObject()
  editorialChecklist?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['APPROVE', 'RETURN', 'REJECT'])
  recommendation?: 'APPROVE' | 'RETURN' | 'REJECT' | null;
}
