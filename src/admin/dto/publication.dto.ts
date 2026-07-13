import { Type } from 'class-transformer';
import { IsDate, MinDate } from 'class-validator';
export class SchedulePublicationDto {
  @Type(() => Date)
  @IsDate()
  @MinDate(new Date())
  publishAt!: Date;
}
