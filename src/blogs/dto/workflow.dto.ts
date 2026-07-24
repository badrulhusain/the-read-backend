import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreateBlogDto } from './create-blog.dto';

export class CreateDraftDto extends PartialType(CreateBlogDto) {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  contributorId?: string;
}

export class AutosaveDraftDto extends CreateDraftDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revision!: number;
}

export class UpdateRichTextDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revision!: number;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

export class ThumbnailCropDto {
  @Type(() => Number) @IsNumber() @Min(0) x!: number;
  @Type(() => Number) @IsNumber() @Min(0) y!: number;
  @Type(() => Number) @IsNumber() @Min(1) width!: number;
  @Type(() => Number) @IsNumber() @Min(1) height!: number;
  @Type(() => Number) @IsNumber() @Min(0.1) zoom!: number;
}

export class UploadThumbnailDto {
  @IsString() @IsNotEmpty() @MaxLength(255) altText!: string;
  @IsOptional() @IsString() @MaxLength(500) caption?: string;
}

export class UpdateThumbnailMetadataDto {
  @IsString() @IsNotEmpty() @MaxLength(255) altText!: string;
  @IsOptional() @IsString() @MaxLength(500) caption?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => ThumbnailCropDto)
  crop?: ThumbnailCropDto;
}

export class CreateSourceDto {
  @IsString() @IsNotEmpty() @MaxLength(255) title!: string;
  @IsUrl() url!: string;
  @IsOptional() @IsString() @MaxLength(255) publisher?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class VerifySourceDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
