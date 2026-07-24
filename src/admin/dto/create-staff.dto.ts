import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from '../../common/decorators/trim.decorator';

export class CreateStaffDto {
  @IsString()
  @Trim()
  @MaxLength(100)
  name: string;

  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;
}
