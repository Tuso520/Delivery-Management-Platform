interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
}

interface SessionData {
  accessToken: string;
  user: {
    username: string;
    roles: string[];
    permissions: string[];
  };
}

interface ProjectListData {
  items: Array<{ id: string; projectCode: string }>;
  page: number;
  pageSize: number;
  total: number;
}

const AUTHENTICATED_E2E_TIMEOUT_MS = 90_000;

describe('running Delivery Platform API', () => {
  const baseUrl = (process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(
    /\/$/u,
    '',
  );
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;

  it('reports health through the real HTTP stack', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as ApiEnvelope<string>;

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ code: 0, message: 'success', data: 'OK' }));
  });

  it(
    'logs in, rotates the refresh cookie and returns flat project pagination',
    async () => {
      if (!username || !password) {
        throw new Error(
          'E2E_USERNAME and E2E_PASSWORD are required for the authenticated E2E test',
        );
      }

      const loginResponse = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const login = (await loginResponse.json()) as ApiEnvelope<SessionData>;
      const refreshCookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];

      expect(loginResponse.status).toBe(200);
      expect(login.data.user.username).toBe(username);
      expect(login.data.accessToken).toEqual(expect.any(String));
      expect(refreshCookie).toContain('=');

      const refreshResponse = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { cookie: refreshCookie ?? '' },
      });
      const refreshed = (await refreshResponse.json()) as ApiEnvelope<SessionData>;
      expect(refreshResponse.status).toBe(200);
      expect(refreshed.data.accessToken).toEqual(expect.any(String));

      const projectsResponse = await fetch(`${baseUrl}/projects?page=1&pageSize=2`, {
        headers: { authorization: `Bearer ${refreshed.data.accessToken}` },
      });
      const projects = (await projectsResponse.json()) as ApiEnvelope<ProjectListData>;

      expect(projectsResponse.status).toBe(200);
      expect(Array.isArray(projects.data.items)).toBe(true);
      expect(projects.data.page).toBe(1);
      expect(projects.data.pageSize).toBe(2);
      expect(typeof projects.data.total).toBe('number');
      expect(projects.data.items.length).toBeLessThanOrEqual(2);
      expect(Object.prototype.hasOwnProperty.call(projects.data, 'data')).toBe(false);
    },
    AUTHENTICATED_E2E_TIMEOUT_MS,
  );
});
