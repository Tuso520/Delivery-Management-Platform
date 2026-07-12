import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => {
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!accessKey) {
      throw new Error('FATAL: MINIO_ACCESS_KEY is required in production. Update your .env file.');
    }
    if (!secretKey) {
      throw new Error('FATAL: MINIO_SECRET_KEY is required in production. Update your .env file.');
    }
    if (accessKey === 'minioadmin' && secretKey === 'minioadmin') {
      throw new Error('FATAL: MinIO must not use the default credential pair in production.');
    }
  }

  return {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    accessKey: accessKey || '',
    secretKey: secretKey || '',
    bucket: process.env.MINIO_BUCKET || 'delivery-platform',
    useSSL: process.env.MINIO_USE_SSL === 'true',
  };
});
