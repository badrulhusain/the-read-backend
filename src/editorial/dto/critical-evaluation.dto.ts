import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  EditorRecommendation,
  FactCheckStatus,
  GrammarStatus,
  SourceVerificationStatus,
} from '../../generated/prisma/client';

export class CriticalEvaluationDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(100) contentQualityScore!: number;
  @IsEnum(GrammarStatus) grammarStatus!: GrammarStatus;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) readabilityScore!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) plagiarismScore!: number;
  @IsOptional() @IsString() @MaxLength(10000) plagiarismNotes?: string;
  @IsEnum(FactCheckStatus) factCheckStatus!: FactCheckStatus;
  @IsOptional() @IsString() @MaxLength(10000) factCheckNotes?: string;
  @IsEnum(SourceVerificationStatus)
  sourceVerificationStatus!: SourceVerificationStatus;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) headlineQuality!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) introductionQuality!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) structureQuality!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) conclusionQuality!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) seoReadiness!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) thumbnailQuality!: number;
  @IsBoolean() copyrightConfirmed!: boolean;
  @IsEnum(EditorRecommendation) recommendation!: EditorRecommendation;
  @IsOptional() @IsString() @MaxLength(20000) internalNotes?: string;
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  requiredCorrections!: string[];
  @IsObject() finalChecklist!: Record<string, unknown>;
}

export class CorrectionDto {
  @IsString() @IsNotEmpty() @MaxLength(20000) reason!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  requiredCorrections!: string[];
}

export class AdminRejectDto {
  @IsString() @IsNotEmpty() @MaxLength(20000) reason!: string;
}
