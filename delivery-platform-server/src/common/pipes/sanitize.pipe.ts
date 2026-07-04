import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

/**
 * XSS Sanitization Pipe
 *
 * Strips HTML tags from all string values in the request body
 * to prevent stored XSS attacks. Applied as a global pipe.
 *
 * This is a lightweight sanitizer. For production use with rich text,
 * consider using a dedicated library like DOMPurify or sanitize-html.
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.transform(item, _metadata));
    }

    if (value !== null && typeof value === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        sanitized[key] = this.transform(val, _metadata);
      }
      return sanitized;
    }

    return value;
  }

  private sanitizeString(input: string): string {
    // Strip HTML tags
    let sanitized = input.replace(/<[^>]*>/g, '');
    // Encode any remaining angle brackets
    sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return sanitized;
  }
}
