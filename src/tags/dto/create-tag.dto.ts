import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;
}
