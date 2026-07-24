import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  FactCheckStatus,
  ReviewDecision,
  SubmissionStatus,
} from '../../generated/prisma/client';
import { Trim } from '../../common/decorators/trim.decorator';

export class ContributorDto {
  @IsString() @Trim() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsString() @MaxLength(160) organization?: string;
  @IsOptional() @IsUrl() websiteUrl?: string;
}

export class CreateSubmissionDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })
  @ValidateNested()
  @Type(() => ContributorDto)
  contributor!: ContributorDto;
  @IsString() @Trim() @IsNotEmpty() @MaxLength(240) title!: string;
  @IsOptional() @IsString() @Trim() @MaxLength(5000) pitch?: string;
  @IsString() @Trim() @IsNotEmpty() @MaxLength(500000) content!: string;
}

export class SubmissionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number =
    20;
  @IsOptional() @IsEnum(SubmissionStatus) status?: SubmissionStatus;
  @IsOptional() @IsUUID() editorId?: string;
}

export class AssignEditorDto {
  @IsUUID() editorId!: string;
}
export class ChangeSubmissionStatusDto {
  @IsEnum(SubmissionStatus) status!: SubmissionStatus;
}
export class InternalNoteDto {
  @IsString() @IsNotEmpty() @MaxLength(10000) body!: string;
}
export class EmailHistoryDto {
  @IsEmail() recipient!: string;
  @IsString() @IsNotEmpty() @MaxLength(240) subject!: string;
  @IsString() @IsNotEmpty() @MaxLength(50000) body!: string;
  @IsOptional() @IsString() providerMessageId?: string;
}
export class ReviewSubmissionDto {
  @IsEnum(ReviewDecision) decision!: ReviewDecision;
  @IsOptional() @IsString() @MaxLength(10000) summary?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) plagiarismScore?: number;
  @IsOptional() @IsString() plagiarismNotes?: string;
  @IsEnum(FactCheckStatus) factCheckStatus!: FactCheckStatus;
  @IsOptional() @IsString() factCheckNotes?: string;
  @IsObject() checklist!: Record<string, unknown>;
}
