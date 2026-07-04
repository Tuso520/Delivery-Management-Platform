import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Configure it in your .env file. ' +
      'Example: DATABASE_URL=mysql://user:password@host:3306/delivery_platform',
    );
  }
  return { url };
});
