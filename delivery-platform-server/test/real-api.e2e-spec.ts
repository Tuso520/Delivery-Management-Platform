interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
  traceId: string;
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

interface FieldConfigurationData {
  fieldCode: string;
  fieldName: string;
  required: boolean;
  enabled: boolean;
  defaultValue: unknown;
  sort: number;
  options: Array<{
    id: string;
    label: string;
    value: string;
    enabled: boolean;
    sort: number;
  }>;
}

interface FieldCategoryData {
  id: string;
  categoryCode: string;
}

interface FieldValueData {
  id: string;
  value: string;
  name: string;
  code: string | null;
  description: string | null;
  sortOrder: number;
  status: 'Active' | 'Inactive';
  isSystemDefault: boolean;
}

interface FieldValuesPage {
  items: FieldValueData[];
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
  const limitedUsername = process.env.E2E_LIMITED_USERNAME;
  const limitedPassword = process.env.E2E_LIMITED_PASSWORD;

  async function login(resolvedUsername: string, resolvedPassword: string): Promise<SessionData> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: resolvedUsername, password: resolvedPassword }),
    });
    const body = (await response.json()) as ApiEnvelope<SessionData>;
    expect(response.status).toBe(200);
    expect(body.traceId).toEqual(expect.any(String));
    return body.data;
  }

  async function expectAuthenticatedGet(
    path: string,
    accessToken: string,
    expectedStatus = 200,
  ): Promise<ApiEnvelope<unknown>> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = (await response.json()) as ApiEnvelope<unknown>;
    expect(response.status).toBe(expectedStatus);
    expect(body.traceId).toEqual(expect.any(String));
    expect(body.timestamp).toEqual(expect.any(String));
    return body;
  }

  async function expectAuthenticatedRequest<T>(
    path: string,
    accessToken: string,
    init: RequestInit,
    expectedStatus = 200,
  ): Promise<ApiEnvelope<T>> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const body = (await response.json()) as ApiEnvelope<T>;
    expect(response.status).toBe(expectedStatus);
    expect(body.traceId).toEqual(expect.any(String));
    expect(body.timestamp).toEqual(expect.any(String));
    return body;
  }

  it('reports health through the real HTTP stack', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as ApiEnvelope<string>;

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ code: 0, message: 'success', data: 'OK' }));
  });

  it(
    'uses field configuration as the project, country and currency option source',
    async () => {
      if (!username || !password) {
        throw new Error('E2E_USERNAME and E2E_PASSWORD are required for field configuration E2E');
      }
      const admin = await login(username, password);
      const fieldsResponse = await expectAuthenticatedGet(
        '/field-options/module/project',
        admin.accessToken,
      );
      const fields = fieldsResponse.data as FieldConfigurationData[];
      expect(fields.map((field) => field.fieldCode)).toEqual(
        expect.arrayContaining([
          'COUNTRY',
          'CURRENCY',
          'CUSTOMER_TYPE',
          'CONTRACT_TYPE',
          'PROJECT_STAGE',
        ]),
      );
      const countryField = fields.find((field) => field.fieldCode === 'COUNTRY');
      const currencyField = fields.find((field) => field.fieldCode === 'CURRENCY');
      expect(countryField?.required).toBe(true);
      expect(countryField?.defaultValue).toBe('CN');
      expect(currencyField?.defaultValue).toBe('CNY');

      const countriesResponse = await expectAuthenticatedGet(
        '/countries?page=1&pageSize=100',
        admin.accessToken,
      );
      const countries = countriesResponse.data as {
        items: Array<{ countryCode: string; nameZh: string; status: string }>;
      };
      for (const country of countries.items) {
        expect(countryField?.options).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              value: country.countryCode,
              label: country.nameZh,
              enabled: country.status === 'Active',
            }),
          ]),
        );
      }

      const currenciesResponse = await expectAuthenticatedGet('/currencies', admin.accessToken);
      const currencies = currenciesResponse.data as Array<{
        currencyCode: string;
        currencyName: string;
        status: string;
      }>;
      for (const currency of currencies) {
        expect(currencyField?.options).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              value: currency.currencyCode,
              label: currency.currencyName,
              enabled: currency.status === 'Active',
            }),
          ]),
        );
      }

      const versionResponse = await expectAuthenticatedGet(
        '/field-config/version',
        admin.accessToken,
      );
      expect(versionResponse.data).toEqual(
        expect.objectContaining({
          version: expect.any(String),
          revision: expect.any(Number),
        }),
      );
    },
    AUTHENTICATED_E2E_TIMEOUT_MS,
  );

  it(
    'propagates field option mutations, preserves history and enforces management permissions',
    async () => {
      if (!username || !password || !limitedUsername || !limitedPassword) {
        throw new Error(
          'Admin and limited E2E credentials are required for field mutation verification',
        );
      }

      const admin = await login(username, password);
      const limited = await login(limitedUsername, limitedPassword);
      const limitedManagementResponse = await expectAuthenticatedGet(
        '/field-config/categories',
        limited.accessToken,
        403,
      );
      expect(limitedManagementResponse.code).not.toBe(0);
      const limitedBusinessResponse = await expectAuthenticatedGet(
        '/field-options/module/project',
        limited.accessToken,
      );
      expect(limitedBusinessResponse.code).toBe(0);

      const categoriesResponse = await expectAuthenticatedGet(
        '/field-config/categories',
        admin.accessToken,
      );
      const categories = categoriesResponse.data as FieldCategoryData[];
      const categoryByCode = new Map(
        categories.map((category) => [category.categoryCode, category]),
      );
      for (const categoryCode of [
        'COUNTRY',
        'CURRENCY',
        'CUSTOMER_TYPE',
        'PROJECT_STAGE',
        'PROJECT_TYPE',
      ]) {
        expect(categoryByCode.get(categoryCode)?.id).toEqual(expect.any(String));
      }

      const getValues = async (categoryCode: string): Promise<FieldValueData[]> => {
        const category = categoryByCode.get(categoryCode);
        if (!category) throw new Error(`Missing field category ${categoryCode}`);
        const response = await expectAuthenticatedGet(
          `/field-config/categories/${category.id}/values?page=1&pageSize=100`,
          admin.accessToken,
        );
        return (response.data as FieldValuesPage).items;
      };
      const updateValue = async (
        value: FieldValueData,
        data: Pick<FieldValueData, 'name' | 'code' | 'sortOrder'>,
      ): Promise<FieldValueData> =>
        (
          await expectAuthenticatedRequest<FieldValueData>(
            `/field-config/values/${value.id}`,
            admin.accessToken,
            { method: 'PATCH', body: JSON.stringify(data) },
          )
        ).data;
      const createValue = async (
        categoryCode: string,
        data: { name: string; code: string; sortOrder: number },
      ): Promise<FieldValueData> => {
        const category = categoryByCode.get(categoryCode);
        if (!category) throw new Error(`Missing field category ${categoryCode}`);
        return (
          await expectAuthenticatedRequest<FieldValueData>(
            `/field-config/categories/${category.id}/values`,
            admin.accessToken,
            { method: 'POST', body: JSON.stringify(data) },
            201,
          )
        ).data;
      };
      const changeStatus = async (
        id: string,
        status: FieldValueData['status'],
      ): Promise<FieldValueData> =>
        (
          await expectAuthenticatedRequest<FieldValueData>(
            `/field-config/values/${id}/status`,
            admin.accessToken,
            { method: 'PATCH', body: JSON.stringify({ status }) },
          )
        ).data;
      const removeValue = async (id: string): Promise<void> => {
        await expectAuthenticatedRequest<null>(
          `/field-config/values/${id}`,
          admin.accessToken,
          { method: 'DELETE' },
        );
      };
      const getProjectFields = async (): Promise<FieldConfigurationData[]> =>
        (
          await expectAuthenticatedGet('/field-options/module/project', admin.accessToken)
        ).data as FieldConfigurationData[];

      for (const categoryCode of ['PROJECT_TYPE', 'CUSTOMER_TYPE', 'PROJECT_STAGE']) {
        const staleValues = (await getValues(categoryCode)).filter(
          (value) =>
            !value.isSystemDefault &&
            (value.code?.startsWith('E2E_PROJECT_') ||
              value.code?.startsWith('E2E_CUSTOMER_') ||
              value.code?.startsWith('E2E_STAGE_')),
        );
        for (const staleValue of staleValues) {
          await removeValue(staleValue.id);
        }
      }

      const country = (await getValues('COUNTRY')).find((value) => value.value === 'CN');
      const currency = (await getValues('CURRENCY')).find((value) => value.value === 'CNY');
      if (!country || !currency) throw new Error('Seeded CN/CNY field options are required');

      const suffix = Date.now().toString(36).toUpperCase();
      const createdIds: string[] = [];
      let countryChanged = false;
      let currencyChanged = false;
      try {
        const countryTestName = `${country.name}（联动验证）`;
        await updateValue(country, {
          name: countryTestName,
          code: country.code,
          sortOrder: country.sortOrder,
        });
        countryChanged = true;
        const countriesResponse = await expectAuthenticatedGet(
          '/countries?page=1&pageSize=100',
          admin.accessToken,
        );
        const countries = countriesResponse.data as {
          items: Array<{ countryCode: string; nameZh: string }>;
        };
        expect(countries.items.find((item) => item.countryCode === 'CN')?.nameZh).toBe(
          countryTestName,
        );

        const currencyTestName = `${currency.name}（联动验证）`;
        await updateValue(currency, {
          name: currencyTestName,
          code: currency.code,
          sortOrder: currency.sortOrder,
        });
        currencyChanged = true;
        const currenciesResponse = await expectAuthenticatedGet(
          '/currencies',
          admin.accessToken,
        );
        const currencies = currenciesResponse.data as Array<{
          currencyCode: string;
          currencyName: string;
        }>;
        expect(
          currencies.find((item) => item.currencyCode === 'CNY')?.currencyName,
        ).toBe(currencyTestName);

        const projectTypeFirst = await createValue('PROJECT_TYPE', {
          name: `端到端项目类型甲-${suffix}`,
          code: `E2E_PROJECT_A_${suffix}`,
          sortOrder: 902,
        });
        createdIds.push(projectTypeFirst.id);
        const projectTypeSecond = await createValue('PROJECT_TYPE', {
          name: `端到端项目类型乙-${suffix}`,
          code: `E2E_PROJECT_B_${suffix}`,
          sortOrder: 901,
        });
        createdIds.push(projectTypeSecond.id);
        const customerType = await createValue('CUSTOMER_TYPE', {
          name: `端到端客户类型-${suffix}`,
          code: `E2E_CUSTOMER_${suffix}`,
          sortOrder: 900,
        });
        createdIds.push(customerType.id);
        const projectStage = await createValue('PROJECT_STAGE', {
          name: `端到端自定义阶段-${suffix}`,
          code: `E2E_STAGE_${suffix}`,
          sortOrder: 950,
        });
        createdIds.push(projectStage.id);

        const projectTypeCategory = categoryByCode.get('PROJECT_TYPE');
        if (!projectTypeCategory) throw new Error('Missing PROJECT_TYPE category');
        await expectAuthenticatedRequest<FieldValueData[]>(
          `/field-config/categories/${projectTypeCategory.id}/sort`,
          admin.accessToken,
          {
            method: 'PUT',
            body: JSON.stringify({
              items: [
                { id: projectTypeFirst.id, sortOrder: 900 },
                { id: projectTypeSecond.id, sortOrder: 901 },
              ],
            }),
          },
        );
        const renamedProjectType = await updateValue(projectTypeFirst, {
          name: `端到端项目类型已重命名-${suffix}`,
          code: projectTypeFirst.code,
          sortOrder: 900,
        });
        expect(renamedProjectType.value).toBe(projectTypeFirst.value);

        let projectFields = await getProjectFields();
        const projectTypeField = projectFields.find(
          (field) => field.fieldCode === 'PROJECT_TYPE',
        );
        const firstOption = projectTypeField?.options.find(
          (option) => option.id === projectTypeFirst.id,
        );
        const secondOption = projectTypeField?.options.find(
          (option) => option.id === projectTypeSecond.id,
        );
        expect(firstOption).toEqual(
          expect.objectContaining({
            label: `端到端项目类型已重命名-${suffix}`,
            value: projectTypeFirst.value,
            enabled: true,
            sort: 900,
          }),
        );
        expect(secondOption?.sort).toBe(901);
        expect(
          (projectTypeField?.options.indexOf(firstOption!) ?? -1) <
            (projectTypeField?.options.indexOf(secondOption!) ?? -1),
        ).toBe(true);
        expect(
          projectFields
            .find((field) => field.fieldCode === 'CUSTOMER_TYPE')
            ?.options.find((option) => option.id === customerType.id),
        ).toEqual(expect.objectContaining({ enabled: true, value: customerType.value }));
        expect(
          projectFields
            .find((field) => field.fieldCode === 'PROJECT_STAGE')
            ?.options.find((option) => option.id === projectStage.id),
        ).toEqual(expect.objectContaining({ enabled: true, value: projectStage.value }));

        await changeStatus(projectTypeFirst.id, 'Inactive');
        await changeStatus(customerType.id, 'Inactive');
        projectFields = await getProjectFields();
        expect(
          projectFields
            .find((field) => field.fieldCode === 'PROJECT_TYPE')
            ?.options.find((option) => option.id === projectTypeFirst.id),
        ).toEqual(expect.objectContaining({ enabled: false, value: projectTypeFirst.value }));
        expect(
          projectFields
            .find((field) => field.fieldCode === 'CUSTOMER_TYPE')
            ?.options.find((option) => option.id === customerType.id),
        ).toEqual(expect.objectContaining({ enabled: false, value: customerType.value }));
      } finally {
        for (const id of createdIds.reverse()) {
          await removeValue(id);
        }
        if (currencyChanged) {
          await updateValue(currency, {
            name: currency.name,
            code: currency.code,
            sortOrder: currency.sortOrder,
          });
        }
        if (countryChanged) {
          await updateValue(country, {
            name: country.name,
            code: country.code,
            sortOrder: country.sortOrder,
          });
        }
      }
    },
    AUTHENTICATED_E2E_TIMEOUT_MS,
  );

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
      expect(login.traceId).toEqual(expect.any(String));
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

  it(
    'covers standard, knowledge, review, notification and permission boundaries',
    async () => {
      if (!username || !password || !limitedUsername || !limitedPassword) {
        throw new Error(
          'Admin and limited E2E credentials are required for the permission matrix test',
        );
      }

      const admin = await login(username, password);
      for (const path of [
        '/standards?page=1&pageSize=5',
        '/knowledge?page=1&pageSize=5',
        '/file-reviews?page=1&pageSize=5',
        '/notifications?page=1&pageSize=5',
        '/notifications/unread-count',
        '/notification-rules?page=1&pageSize=5',
      ]) {
        const body = await expectAuthenticatedGet(path, admin.accessToken);
        expect(body.code).toBe(0);
      }

      const limited = await login(limitedUsername, limitedPassword);
      for (const path of [
        '/standards?page=1&pageSize=5',
        '/knowledge?page=1&pageSize=5',
        '/notification-rules?page=1&pageSize=5',
      ]) {
        const body = await expectAuthenticatedGet(path, limited.accessToken, 403);
        expect(body.code).not.toBe(0);
      }
      for (const path of [
        '/file-reviews?page=1&pageSize=5',
        '/notifications?page=1&pageSize=5',
        '/notifications/unread-count',
      ]) {
        const body = await expectAuthenticatedGet(path, limited.accessToken);
        expect(body.code).toBe(0);
      }
    },
    AUTHENTICATED_E2E_TIMEOUT_MS,
  );
});
