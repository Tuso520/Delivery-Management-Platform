import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required. Set it in the deployment environment.');
  }
  if (process.env.NODE_ENV === 'production' && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long in production.');
  }
  const refreshTokenExpiresDays = Number.parseInt(
    process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7',
    10,
  );
  if (!Number.isInteger(refreshTokenExpiresDays) || refreshTokenExpiresDays < 1) {
    throw new Error('REFRESH_TOKEN_EXPIRES_DAYS must be a positive integer.');
  }
  return {
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    jwtIssuer: process.env.JWT_ISSUER || 'delivery-platform',
    refreshTokenExpiresDays,
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'delivery_refresh_token',
  };
});
