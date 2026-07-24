import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Trim()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatarPublicId?: string;
}
