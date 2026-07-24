import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class CreateCommentDto {
  @IsString()
  @Trim()
  @MinLength(1)
  @MaxLength(1500)
  content: string;
}
