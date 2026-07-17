import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinDate,
} from 'class-validator';
export class SchedulePublicationDto {
  @Type(() => Date)
  @IsDate()
  @MinDate(new Date())
  publishAt!: Date;
}

export class ReturnToEditorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  note!: string;
}
