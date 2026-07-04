import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required. Set it in the deployment environment.');
  }
  return {
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    jwtIssuer: process.env.JWT_ISSUER || 'delivery-platform',
  };
});
