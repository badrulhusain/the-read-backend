import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class EditorialEditDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revision!: number;
  @IsOptional()
  @IsString()
  @Trim()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @Trim()
  @MinLength(10)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;
}
