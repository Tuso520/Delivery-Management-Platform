import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadProjectArchiveFileDto {
  @IsIn(['REPLACE', 'NEW_VERSION'])
  uploadMode: 'REPLACE' | 'NEW_VERSION';

  @IsIn(['MINOR', 'MAJOR'])
  revisionLevel: 'MINOR' | 'MAJOR';

  @IsOptional()
  @IsString()
  logicalFileId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  createNewLogicalFile?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeDescription?: string;
}
