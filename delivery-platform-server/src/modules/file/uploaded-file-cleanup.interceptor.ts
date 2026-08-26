import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { catchError, from, mergeMap, Observable, throwError } from 'rxjs';

import { FileStorageService } from './file-storage.service';

interface RequestWithUploadedFile extends Request {
  file?: Express.Multer.File;
}

@Injectable()
export class UploadedFileCleanupInterceptor implements NestInterceptor {
  constructor(private readonly storage: FileStorageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUploadedFile>();
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          from(this.storage.cleanupUnclaimedUpload(request.file)).pipe(
            mergeMap(() => throwError(() => error)),
          ),
        ),
      );
  }
}
