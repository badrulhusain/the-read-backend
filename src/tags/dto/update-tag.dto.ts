import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @Trim()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
