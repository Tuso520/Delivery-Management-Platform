import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadProjectArchiveFileDto {
  @IsIn(['REPLACE', 'NEW_VERSION'], {
    message: 'uploadMode 必须为 REPLACE 或 NEW_VERSION',
  })
  uploadMode: 'REPLACE' | 'NEW_VERSION';

  @IsIn(['MINOR', 'MAJOR'], { message: 'revisionLevel 必须为 MINOR 或 MAJOR' })
  revisionLevel: 'MINOR' | 'MAJOR';

  @IsOptional()
  @IsString({ message: 'logicalFileId 必须是字符串' })
  logicalFileId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: 'createNewLogicalFile 必须是布尔值' })
  createNewLogicalFile?: boolean;

  @IsOptional()
  @IsString({ message: 'changeDescription 必须是字符串' })
  @MaxLength(1000, { message: 'changeDescription 最多 1000 个字符' })
  changeDescription?: string;
}
