import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from '../../common/decorators/trim.decorator';

export class CreateBlogDto {
  @IsString()
  @Trim()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(500)
  excerpt?: string;

  @IsString()
  @Trim()
  @MinLength(10)
  @MaxLength(500000)
  content: string;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? [...new Set(value)] : value,
  )
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(5)
  tagIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(70)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  seoDescription?: string;
}
