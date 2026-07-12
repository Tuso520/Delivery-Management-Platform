import appConfig from '../app.config';
import authConfig from '../auth.config';
import { resolveFileUploadHardLimitBytes } from '../file-processing.config';

const originalEnv = { ...process.env };

describe('startup configuration', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = 'development-secret';
    delete process.env.PORT;
    delete process.env.CORS_ORIGIN;
    delete process.env.REFRESH_TOKEN_EXPIRES_DAYS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('parses explicit CORS origins and a valid port centrally', () => {
    process.env.PORT = '3100';
    process.env.CORS_ORIGIN = 'https://delivery.example.com, https://admin.example.com ';

    expect(appConfig()).toEqual({
      nodeEnv: process.env.NODE_ENV || 'development',
      port: 3100,
      corsOrigins: ['https://delivery.example.com', 'https://admin.example.com'],
    });
  });

  it('rejects invalid ports and wildcard production CORS', () => {
    process.env.PORT = '0';
    expect(() => appConfig()).toThrow('PORT must be an integer between 1 and 65535.');

    process.env.PORT = '3000';
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = '*';
    expect(() => appConfig()).toThrow('CORS_ORIGIN must contain explicit origins in production.');
  });

  it('rejects weak production JWT secrets and invalid refresh lifetimes', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'too-short';
    expect(() => authConfig()).toThrow(
      'JWT_SECRET must be at least 32 characters long in production.',
    );

    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.REFRESH_TOKEN_EXPIRES_DAYS = '0';
    expect(() => authConfig()).toThrow('REFRESH_TOKEN_EXPIRES_DAYS must be a positive integer.');
  });

  it('keeps the deployment upload ceiling bounded in the config layer', () => {
    expect(resolveFileUploadHardLimitBytes('128')).toBe(128 * 1024 * 1024);
    expect(resolveFileUploadHardLimitBytes('0')).toBe(1024 * 1024 * 1024);
    expect(resolveFileUploadHardLimitBytes('2048')).toBe(1024 * 1024 * 1024);
    expect(resolveFileUploadHardLimitBytes('invalid')).toBe(1024 * 1024 * 1024);
  });
});
