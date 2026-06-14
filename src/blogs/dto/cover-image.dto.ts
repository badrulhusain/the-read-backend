import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CoverImageCropDto {
  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  zoom?: number;
}

export class CoverImageDto {
  @IsOptional()
  @IsUrl()
  url?: string | null;

  @IsOptional()
  @IsString()
  publicId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  altText?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoverImageCropDto)
  crop?: CoverImageCropDto | null;
}

export class UpdateCoverImageDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CoverImageDto)
  coverImage?: CoverImageDto | null;
}
