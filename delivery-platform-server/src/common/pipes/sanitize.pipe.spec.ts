import type { ArgumentMetadata } from '@nestjs/common';

import { SanitizePipe } from './sanitize.pipe';

describe('SanitizePipe', () => {
  const pipe = new SanitizePipe();

  it('sanitizes nested request body strings', () => {
    const metadata = { type: 'body' } as ArgumentMetadata;

    expect(
      pipe.transform({ title: '<script>alert(1)</script>safe', tags: ['<b>tag</b>'] }, metadata),
    ).toEqual({ title: 'alert(1)safe', tags: ['tag'] });
  });

  it('preserves uploaded file buffers passed through custom parameter decorators', () => {
    const buffer = Buffer.from('%PDF-1.7');
    const file = { originalname: 'sample.pdf', buffer };
    const metadata = { type: 'custom' } as ArgumentMetadata;

    const result = pipe.transform(file, metadata);

    expect(result).toBe(file);
    expect((result as typeof file).buffer).toBe(buffer);
  });

  it('preserves binary and date values nested in a body', () => {
    const buffer = Buffer.from('binary');
    const date = new Date('2026-07-12T00:00:00.000Z');
    const result = pipe.transform({ buffer, date }, { type: 'body' } as ArgumentMetadata) as {
      buffer: Buffer;
      date: Date;
    };

    expect(result.buffer).toBe(buffer);
    expect(result.date).toBe(date);
  });
});
