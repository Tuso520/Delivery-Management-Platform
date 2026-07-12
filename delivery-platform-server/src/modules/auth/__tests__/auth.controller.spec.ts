import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AuthController } from '../auth.controller';
import type { AuthService, AuthSessionResult } from '../auth.service';

describe('AuthController refresh cookie policy', () => {
  const session: AuthSessionResult = {
    accessToken: 'access-token',
    refreshToken: 'raw-refresh-token',
    refreshExpiresAt: new Date('2026-07-18T00:00:00.000Z'),
    defaultRoute: '/dashboard',
    user: {
      sub: 'user-1',
      username: 'tester',
      realName: '测试用户',
      email: null,
      roles: ['PROJECT_MANAGER'],
      permissions: ['project:view'],
      permissionVersion: 1,
    },
  };

  function createController(nodeEnv = 'test') {
    const authService = {
      login: jest.fn().mockResolvedValue(session),
      refresh: jest.fn().mockResolvedValue(session),
      logout: jest.fn().mockResolvedValue({ message: '登出成功' }),
    } as unknown as AuthService;
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'auth.refreshCookieName') return 'delivery_refresh_token';
        if (key === 'app.nodeEnv') return nodeEnv;
        return undefined;
      }),
    } as unknown as ConfigService;
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    return {
      authService,
      response,
      controller: new AuthController(authService, configService),
    };
  }

  function request(cookie?: string): Request {
    return {
      headers: {
        cookie,
        authorization: 'Bearer access-token',
      },
      ip: '127.0.0.1',
      get: jest
        .fn()
        .mockImplementation((name: string) =>
          name.toLowerCase() === 'user-agent' ? 'jest-browser' : undefined,
        ),
    } as unknown as Request;
  }

  it('keeps the refresh token out of JSON and sets a production-only secure cookie', async () => {
    const { controller, response } = createController('production');

    await expect(
      controller.login({ username: 'tester', password: 'password' }, request(), response),
    ).resolves.toEqual({
      accessToken: 'access-token',
      user: session.user,
      defaultRoute: '/dashboard',
    });
    expect(response.cookie).toHaveBeenCalledWith('delivery_refresh_token', 'raw-refresh-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
      expires: session.refreshExpiresAt,
    });
  });

  it('reads and rotates the refresh token only from the cookie', async () => {
    const { authService, controller, response } = createController();

    await controller.refresh(request('delivery_refresh_token=encoded%2Drefresh'), response);

    expect(authService.refresh).toHaveBeenCalledWith(
      'encoded-refresh',
      expect.objectContaining({
        ipAddress: '127.0.0.1',
        userAgent: 'jest-browser',
      }),
    );
    expect(response.cookie).toHaveBeenCalled();
  });

  it('clears the refresh cookie during current-device logout', async () => {
    const { authService, controller, response } = createController();

    await controller.logout(request('delivery_refresh_token=refresh-token'), response);

    expect(authService.logout).toHaveBeenCalledWith('access-token', 'refresh-token');
    expect(response.clearCookie).toHaveBeenCalledWith(
      'delivery_refresh_token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
      }),
    );
  });
});
