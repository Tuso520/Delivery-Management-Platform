import { basename, extname } from 'path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FileStorageService } from './file-storage.service';

export type ExternalConversionType =
  | 'THUMBNAIL'
  | 'PDF_PREVIEW'
  | 'CAD_CONVERT'
  | 'VISIO_CONVERT'
  | 'VIDEO_TRANSCODE';

export interface ConversionInputAsset {
  id: string;
  originalName: string;
  extension: string | null;
  mimeType: string;
  storageBucket: string;
  storageKey: string;
}

export interface ConvertedFile {
  data: Buffer;
  extension: string;
  mimeType: string;
  originalName: string;
}

interface FileProcessingConfiguration {
  converterUrl: string;
  converterToken: string;
  converterTimeoutMs: number;
  converterMaxOutputBytes: number;
}

const outputFormats: Record<
  ExternalConversionType,
  { extension: string; mimeType: string; suffix: string }
> = {
  THUMBNAIL: { extension: 'webp', mimeType: 'image/webp', suffix: 'thumbnail' },
  PDF_PREVIEW: { extension: 'pdf', mimeType: 'application/pdf', suffix: 'preview' },
  CAD_CONVERT: { extension: 'pdf', mimeType: 'application/pdf', suffix: 'cad-preview' },
  VISIO_CONVERT: { extension: 'pdf', mimeType: 'application/pdf', suffix: 'visio-preview' },
  VIDEO_TRANSCODE: { extension: 'mp4', mimeType: 'video/mp4', suffix: 'preview' },
};

export class FileConversionError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

@Injectable()
export class FileConversionAdapter {
  constructor(
    private readonly config: ConfigService,
    private readonly storage: FileStorageService,
  ) {}

  async convert(
    jobId: string,
    type: ExternalConversionType,
    input: ConversionInputAsset,
  ): Promise<ConvertedFile> {
    const configuration = this.configuration();
    if (!configuration.converterUrl) {
      throw new FileConversionError('FILE_CONVERTER_NOT_CONFIGURED', false);
    }

    let endpoint: URL;
    try {
      endpoint = new URL(configuration.converterUrl);
      if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('invalid protocol');
    } catch {
      throw new FileConversionError('FILE_CONVERTER_URL_INVALID', false);
    }

    const sourceUrl = await this.storage.getPresignedUrlFrom(
      input.storageBucket,
      input.storageKey,
      Math.max(300, Math.ceil(configuration.converterTimeoutMs / 1000) + 60),
    );
    const output = outputFormats[type];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), configuration.converterTimeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          accept: output.mimeType,
          ...(configuration.converterToken
            ? { authorization: `Bearer ${configuration.converterToken}` }
            : {}),
        },
        body: JSON.stringify({
          jobId,
          type,
          input: {
            url: sourceUrl,
            fileName: input.originalName,
            extension: input.extension,
            mimeType: input.mimeType,
          },
          output: {
            extension: output.extension,
            mimeType: output.mimeType,
          },
        }),
      });

      if (!response.ok) {
        if ([408, 425, 429].includes(response.status) || response.status >= 500) {
          throw new FileConversionError('FILE_CONVERTER_UNAVAILABLE', true);
        }
        if ([401, 403].includes(response.status)) {
          throw new FileConversionError('FILE_CONVERTER_AUTH_FAILED', false);
        }
        throw new FileConversionError('FILE_CONVERTER_REJECTED', false);
      }

      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
      if (contentType !== output.mimeType) {
        throw new FileConversionError('FILE_CONVERTER_OUTPUT_INVALID', false);
      }
      const data = await this.readLimitedBody(response, configuration.converterMaxOutputBytes);
      if (data.length === 0) {
        throw new FileConversionError('FILE_CONVERTER_OUTPUT_INVALID', false);
      }
      const sourceExtension = extname(input.originalName);
      const sourceName = basename(input.originalName, sourceExtension) || 'file';
      return {
        data,
        extension: output.extension,
        mimeType: output.mimeType,
        originalName: `${sourceName}-${output.suffix}.${output.extension}`,
      };
    } catch (error) {
      if (error instanceof FileConversionError) throw error;
      if (controller.signal.aborted) {
        throw new FileConversionError('FILE_CONVERTER_TIMEOUT', true);
      }
      throw new FileConversionError('FILE_CONVERTER_UNAVAILABLE', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  private configuration(): FileProcessingConfiguration {
    return (
      this.config.get<FileProcessingConfiguration>('fileProcessing') ?? {
        converterUrl: '',
        converterToken: '',
        converterTimeoutMs: 120_000,
        converterMaxOutputBytes: 200 * 1024 * 1024,
      }
    );
  }

  private async readLimitedBody(response: Response, maxBytes: number): Promise<Buffer> {
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new FileConversionError('FILE_CONVERTER_OUTPUT_TOO_LARGE', false);
    }
    if (!response.body) throw new FileConversionError('FILE_CONVERTER_OUTPUT_INVALID', false);

    const chunks: Buffer[] = [];
    const reader = response.body.getReader();
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        size += chunk.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new FileConversionError('FILE_CONVERTER_OUTPUT_TOO_LARGE', false);
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, size);
  }
}
