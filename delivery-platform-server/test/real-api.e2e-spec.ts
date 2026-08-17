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
  id: string;
  fieldCode: string;
  fieldName: string;
  required: boolean;
  enabled: boolean;
  defaultValue: unknown;
  sort: number;
  options: Array<{
    description: string | null;
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

interface StandardSummaryData {
  total: number;
  viewCount: number;
  downloadCount: number;
}

interface StandardListItem {
  id: string;
  code: string;
  name: string;
  deliveryStageCode: string;
  managementDomainCode: string | null;
  businessTypeCode: string | null;
  countryCodes: string[];
  isEnabled: boolean;
  currentPublishedVersion: {
    id: string;
    version: string;
    status: string;
    effectiveAt: string | null;
  } | null;
}

interface StandardListData {
  items: StandardListItem[];
  page: number;
  pageSize: number;
  total: number;
}

interface StandardVersionData {
  id: string;
  revision: number;
  status: string;
  effectiveAt: string | null;
  fileVersion: {
    logicalFileId: string;
  };
}

interface StandardDetailData extends StandardListItem {
  status: string;
  currentPublishedVersionId: string | null;
  versions: StandardVersionData[];
}

interface ArchiveTemplateListItem {
  id: string;
  templateCode: string;
  templateName: string;
  projectType: string | null;
  currentPublishedVersion: {
    versionNo: string;
    status: string;
  } | null;
}

interface ArchiveTemplateVersionData {
  id: string;
  status: string;
  versionNo: string;
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
    if (response.status !== expectedStatus) {
      throw new Error(
        `GET ${path}: expected ${expectedStatus}, received ${response.status}; response=${JSON.stringify(body)}`,
      );
    }
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
    if (response.status !== expectedStatus) {
      throw new Error(
        `${init.method ?? 'GET'} ${path}: expected ${expectedStatus}, received ${response.status}; response=${JSON.stringify(body)}`,
      );
    }
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
        await expectAuthenticatedRequest<null>(`/field-config/values/${id}`, admin.accessToken, {
          method: 'DELETE',
        });
      };
      const getProjectFields = async (): Promise<FieldConfigurationData[]> =>
        (await expectAuthenticatedGet('/field-options/module/project', admin.accessToken))
          .data as FieldConfigurationData[];

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
        const currenciesResponse = await expectAuthenticatedGet('/currencies', admin.accessToken);
        const currencies = currenciesResponse.data as Array<{
          currencyCode: string;
          currencyName: string;
        }>;
        expect(currencies.find((item) => item.currencyCode === 'CNY')?.currencyName).toBe(
          currencyTestName,
        );

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
        const projectTypeField = projectFields.find((field) => field.fieldCode === 'PROJECT_TYPE');
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
    'serves the Figma standard library from configured stable codes and real database queries',
    async () => {
      if (!username || !password) {
        throw new Error('E2E_USERNAME and E2E_PASSWORD are required for standard library E2E');
      }

      const admin = await login(username, password);
      const fields = (
        await expectAuthenticatedGet('/field-options/module/standard', admin.accessToken)
      ).data as FieldConfigurationData[];
      expect(fields.map((field) => field.fieldCode)).toEqual(
        expect.arrayContaining([
          'COUNTRY',
          'STANDARD_TYPE',
          'STANDARD_DELIVERY_STAGE',
          'STANDARD_MANAGEMENT_DOMAIN',
          'STANDARD_BUSINESS_TYPE',
          'STANDARD_STATUS',
          'STANDARD_ENABLED_STATUS',
          'STANDARD_CURRENT_VERSION',
          'STANDARD_EFFECTIVE_DATE',
        ]),
      );
      const stageField = fields.find((field) => field.fieldCode === 'STANDARD_DELIVERY_STAGE');
      expect(stageField?.options[0]).toEqual(
        expect.objectContaining({
          value: expect.any(String),
          label: expect.any(String),
          description: expect.any(String),
          enabled: true,
        }),
      );

      const summary = (await expectAuthenticatedGet('/standards/summary', admin.accessToken))
        .data as StandardSummaryData;
      expect(summary).toEqual({
        total: expect.any(Number),
        viewCount: expect.any(Number),
        downloadCount: expect.any(Number),
        draft: expect.any(Number),
        inReview: expect.any(Number),
        rejected: expect.any(Number),
        published: expect.any(Number),
        archived: expect.any(Number),
      });

      const counts = (
        await expectAuthenticatedGet(
          '/standards/category-counts?dimension=DELIVERY_STAGE',
          admin.accessToken,
        )
      ).data as Array<{ code: string; count: number }>;
      expect(counts.every((item) => typeof item.code === 'string' && item.count >= 0)).toBe(true);

      const page = (
        await expectAuthenticatedGet(
          '/standards?page=1&pageSize=100&sortBy=name&sortOrder=asc',
          admin.accessToken,
        )
      ).data as StandardListData;
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(100);
      expect(page.items.length).toBeLessThanOrEqual(100);
      const descendingPage = (
        await expectAuthenticatedGet(
          '/standards?page=1&pageSize=100&sortBy=name&sortOrder=desc',
          admin.accessToken,
        )
      ).data as StandardListData;
      expect(descendingPage.items.map((item) => item.id)).toEqual(
        [...page.items.map((item) => item.id)].reverse(),
      );
      for (const item of page.items) {
        expect(typeof item.id).toBe('string');
        expect(typeof item.code).toBe('string');
        expect(typeof item.deliveryStageCode).toBe('string');
        expect(Array.isArray(item.countryCodes)).toBe(true);
        expect(typeof item.isEnabled).toBe('boolean');
      }

      const firstStage = stageField?.options.find((option) => option.enabled);
      if (!firstStage) throw new Error('An enabled standard delivery stage is required');
      const filtered = (
        await expectAuthenticatedGet(
          `/standards?page=1&pageSize=100&deliveryStageCode=${encodeURIComponent(firstStage.value)}`,
          admin.accessToken,
        )
      ).data as StandardListData;
      expect(filtered.items.every((item) => item.deliveryStageCode === firstStage.value)).toBe(
        true,
      );

      const published = page.items.find((item) => item.currentPublishedVersion);
      if (published) {
        const detail = (
          await expectAuthenticatedGet(`/standards/${published.id}`, admin.accessToken)
        ).data as StandardListItem & { versions: Array<{ id: string; status: string }> };
        expect(detail.versions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: published.currentPublishedVersion?.id,
              status: 'PUBLISHED',
            }),
          ]),
        );
      }
    },
    AUTHENTICATED_E2E_TIMEOUT_MS,
  );

  it(
    'creates, reviews, publishes, enables, downloads and archives a real standard version',
    async () => {
      if (!username || !password || !process.env.SEED_DEFAULT_PASSWORD) {
        throw new Error(
          'Admin and seeded reviewer credentials are required for standard lifecycle E2E',
        );
      }

      const admin = await login(username, password);
      const reviewer = await login('delivery_mgr', process.env.SEED_DEFAULT_PASSWORD);
      const marker = Date.now().toString(36).toUpperCase();
      let standardId = '';
      try {
        const form = new FormData();
        form.append(
          'file',
          new Blob(['%PDF-1.4\n% standard lifecycle E2E\n'], { type: 'application/pdf' }),
          `standard-${marker}.pdf`,
        );
        form.append('ownerType', 'STANDARD');
        form.append('changeDescription', 'standard lifecycle E2E');
        const uploadResponse = await fetch(`${baseUrl}/files/drafts`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${admin.accessToken}`,
            'idempotency-key': `standard-upload-${marker}`,
          },
          body: form,
        });
        const upload = (await uploadResponse.json()) as ApiEnvelope<{
          logicalFileId: string;
          fileVersionId: string;
        }>;
        expect(uploadResponse.status).toBe(201);

        const effectiveAt = '2026-08-01T00:00:00.000Z';
        const created = (
          await expectAuthenticatedRequest<StandardDetailData>(
            '/standards',
            admin.accessToken,
            {
              method: 'POST',
              body: JSON.stringify({
                code: `E2E-STD-${marker}`,
                name: `标准版本端到端验证-${marker}`,
                type: 'DOCUMENT_TEMPLATE',
                deliveryStageCode: 'PROJECT_STARTUP',
                businessTypeCode: 'GENERAL',
                countryCodes: ['CN'],
                isEnabled: true,
                effectiveAt,
                version: 'V1.0',
                fileVersionId: upload.data.fileVersionId,
                changeDescription: 'standard lifecycle E2E',
              }),
            },
            201,
          )
        ).data;
        standardId = created.id;
        const draft = created.versions.find((version) => version.status === 'DRAFT');
        if (!draft) throw new Error('Created standard draft version is missing');

        const submitted = (
          await expectAuthenticatedRequest<{ id: string; status: string }>(
            `/standard-versions/${draft.id}/submit-review`,
            admin.accessToken,
            {
              method: 'POST',
              body: JSON.stringify({ revision: draft.revision }),
            },
            201,
          )
        ).data;
        expect(submitted.status).toBe('PENDING');

        await expectAuthenticatedRequest(
          `/file-reviews/${submitted.id}/approve`,
          reviewer.accessToken,
          {
            method: 'POST',
            body: JSON.stringify({ comment: 'standard lifecycle E2E approved' }),
          },
          201,
        );

        let detail = (await expectAuthenticatedGet(`/standards/${standardId}`, admin.accessToken))
          .data as StandardDetailData;
        expect(detail.status).toBe('PUBLISHED');
        expect(detail.currentPublishedVersionId).toBe(draft.id);
        expect(detail.currentPublishedVersion).toEqual(
          expect.objectContaining({
            id: draft.id,
            status: 'PUBLISHED',
            effectiveAt,
          }),
        );
        expect(detail.versions.find((version) => version.id === draft.id)?.status).toBe(
          'PUBLISHED',
        );

        detail = (
          await expectAuthenticatedRequest<StandardDetailData>(
            `/standards/${standardId}/enabled`,
            admin.accessToken,
            { method: 'PATCH', body: JSON.stringify({ enabled: false }) },
          )
        ).data;
        expect(detail.isEnabled).toBe(false);
        detail = (
          await expectAuthenticatedRequest<StandardDetailData>(
            `/standards/${standardId}/enabled`,
            admin.accessToken,
            { method: 'PATCH', body: JSON.stringify({ enabled: true }) },
          )
        ).data;
        expect(detail.isEnabled).toBe(true);

        const downloadResponse = await fetch(
          `${baseUrl}/files/${upload.data.logicalFileId}/download`,
          { headers: { authorization: `Bearer ${admin.accessToken}` } },
        );
        expect(downloadResponse.status).toBe(200);
        expect(downloadResponse.headers.get('content-disposition')).toContain(
          `standard-${marker}.pdf`,
        );
        expect((await downloadResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);
      } finally {
        if (standardId) {
          await expectAuthenticatedRequest(`/standards/${standardId}/archive`, admin.accessToken, {
            method: 'POST',
          });
        }
      }
    },
    AUTHENTICATED_E2E_TIMEOUT_MS,
  );

  it(
    'propagates standard field names, defaults, option ordering and disabled history by stable code',
    async () => {
      if (!username || !password) {
        throw new Error(
          'E2E_USERNAME and E2E_PASSWORD are required for standard field linkage E2E',
        );
      }

      const admin = await login(username, password);
      const fields = (
        await expectAuthenticatedGet('/field-options/module/standard', admin.accessToken)
      ).data as FieldConfigurationData[];
      const stageField = fields.find((field) => field.fieldCode === 'STANDARD_DELIVERY_STAGE');
      if (!stageField) throw new Error('Missing STANDARD_DELIVERY_STAGE field configuration');
      const projectStartup = stageField.options.find(
        (option) => option.value === 'PROJECT_STARTUP',
      );
      const alternateDefault = stageField.options.find(
        (option) => option.value !== 'PROJECT_STARTUP' && option.enabled,
      );
      if (!projectStartup || !alternateDefault) {
        throw new Error('Configured delivery stage options are required');
      }

      const categories = (
        await expectAuthenticatedGet('/field-config/categories', admin.accessToken)
      ).data as FieldCategoryData[];
      const category = categories.find((item) => item.categoryCode === 'STANDARD_DELIVERY_STAGE');
      if (!category) throw new Error('Missing standard delivery stage category');
      const values = (
        await expectAuthenticatedGet(
          `/field-config/categories/${category.id}/values?page=1&pageSize=100`,
          admin.accessToken,
        )
      ).data as FieldValuesPage;
      const startupValue = values.items.find((item) => item.value === 'PROJECT_STARTUP');
      if (!startupValue) throw new Error('Missing PROJECT_STARTUP field option');

      const marker = Date.now().toString(36).toUpperCase();
      const changedFieldName = `${stageField.fieldName}-${marker}`;
      const changedOptionName = `${startupValue.name}-${marker}`;
      let fieldChanged = false;
      let valueChanged = false;
      let statusChanged = false;
      try {
        await expectAuthenticatedRequest(`/field-config/${stageField.id}`, admin.accessToken, {
          method: 'PATCH',
          body: JSON.stringify({
            fieldName: changedFieldName,
            defaultValue: alternateDefault.value,
          }),
        });
        fieldChanged = true;
        await expectAuthenticatedRequest(
          `/field-config/values/${startupValue.id}`,
          admin.accessToken,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: changedOptionName,
              code: startupValue.code,
              description: startupValue.description,
              sortOrder: startupValue.sortOrder + 1,
            }),
          },
        );
        valueChanged = true;

        let linkedFields = (
          await expectAuthenticatedGet('/field-options/module/standard', admin.accessToken)
        ).data as FieldConfigurationData[];
        let linkedStage = linkedFields.find(
          (field) => field.fieldCode === 'STANDARD_DELIVERY_STAGE',
        );
        expect(linkedStage).toEqual(
          expect.objectContaining({
            fieldName: changedFieldName,
            defaultValue: alternateDefault.value,
          }),
        );
        expect(linkedStage?.options.find((option) => option.value === startupValue.value)).toEqual(
          expect.objectContaining({
            label: changedOptionName,
            sort: startupValue.sortOrder + 1,
            enabled: true,
          }),
        );

        await expectAuthenticatedRequest(
          `/field-config/values/${startupValue.id}/status`,
          admin.accessToken,
          { method: 'PATCH', body: JSON.stringify({ status: 'Inactive' }) },
        );
        statusChanged = true;
        linkedFields = (
          await expectAuthenticatedGet('/field-options/module/standard', admin.accessToken)
        ).data as FieldConfigurationData[];
        linkedStage = linkedFields.find((field) => field.fieldCode === 'STANDARD_DELIVERY_STAGE');
        expect(linkedStage?.options.find((option) => option.value === startupValue.value)).toEqual(
          expect.objectContaining({ enabled: false, value: 'PROJECT_STARTUP' }),
        );

        const historical = (
          await expectAuthenticatedGet(
            '/standards?page=1&pageSize=100&deliveryStageCode=PROJECT_STARTUP',
            admin.accessToken,
          )
        ).data as StandardListData;
        expect(historical.items.length).toBeGreaterThan(0);
        expect(historical.items.every((item) => item.deliveryStageCode === 'PROJECT_STARTUP')).toBe(
          true,
        );
      } finally {
        if (statusChanged) {
          await expectAuthenticatedRequest(
            `/field-config/values/${startupValue.id}/status`,
            admin.accessToken,
            { method: 'PATCH', body: JSON.stringify({ status: 'Active' }) },
          );
        }
        if (valueChanged) {
          await expectAuthenticatedRequest(
            `/field-config/values/${startupValue.id}`,
            admin.accessToken,
            {
              method: 'PATCH',
              body: JSON.stringify({
                name: startupValue.name,
                code: startupValue.code,
                description: startupValue.description,
                sortOrder: startupValue.sortOrder,
              }),
            },
          );
        }
        if (fieldChanged) {
          await expectAuthenticatedRequest(`/field-config/${stageField.id}`, admin.accessToken, {
            method: 'PATCH',
            body: JSON.stringify({
              fieldName: stageField.fieldName,
              defaultValue: stageField.defaultValue,
            }),
          });
        }
      }
    },
    AUTHENTICATED_E2E_TIMEOUT_MS,
  );

  it(
    'queries and sorts archive templates through the real database with permission enforcement',
    async () => {
      if (!username || !password || !limitedUsername || !limitedPassword) {
        throw new Error('Admin and limited E2E credentials are required for archive template E2E');
      }

      const admin = await login(username, password);
      const sortedResponse = await expectAuthenticatedGet(
        '/archive-templates?sortBy=templateName&sortOrder=asc',
        admin.accessToken,
      );
      const sorted = sortedResponse.data as ArchiveTemplateListItem[];
      expect(sorted.length).toBeGreaterThan(0);
      const reverseResponse = await expectAuthenticatedGet(
        '/archive-templates?sortBy=templateName&sortOrder=desc',
        admin.accessToken,
      );
      const reverse = reverseResponse.data as ArchiveTemplateListItem[];
      expect(reverse.map((item) => item.id)).toEqual([...sorted.map((item) => item.id)].reverse());

      const target = sorted[0];
      const searchResponse = await expectAuthenticatedGet(
        `/archive-templates?keyword=${encodeURIComponent(target.templateCode)}`,
        admin.accessToken,
      );
      const search = searchResponse.data as ArchiveTemplateListItem[];
      expect(search).toEqual([expect.objectContaining({ id: target.id })]);

      const invalidSort = await expectAuthenticatedGet(
        '/archive-templates?sortBy=updatedAt&sortOrder=asc',
        admin.accessToken,
        400,
      );
      expect(invalidSort.code).not.toBe(0);

      const limited = await login(limitedUsername, limitedPassword);
      expect(limited.user.permissions).toContain('project:update');
      expect(limited.user.permissions).not.toContain('archive_template:view');
      const projectReferenceResponse = await expectAuthenticatedGet(
        '/archive-templates',
        limited.accessToken,
      );
      expect(projectReferenceResponse.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: target.id,
            currentPublishedVersion: expect.objectContaining({ status: 'PUBLISHED' }),
          }),
        ]),
      );

      const forbiddenDetail = await expectAuthenticatedGet(
        `/archive-templates/${target.id}`,
        limited.accessToken,
        403,
      );
      expect(forbiddenDetail.code).not.toBe(0);
    },
    AUTHENTICATED_E2E_TIMEOUT_MS,
  );

  it(
    'submits an archive template draft with the configured business review flow',
    async () => {
      if (!username || !password || !process.env.SEED_DEFAULT_PASSWORD) {
        throw new Error(
          'Admin and seeded reviewer credentials are required for archive template review E2E',
        );
      }
      const admin = await login(username, password);
      const reviewer = await login('delivery_mgr', process.env.SEED_DEFAULT_PASSWORD);
      const configuredFlow = (
        await expectAuthenticatedRequest<{ id: string }>(
          '/approval-templates',
          admin.accessToken,
          {
            method: 'POST',
            body: JSON.stringify({
              templateCode: `E2E_ARCHIVE_TEMPLATE_REVIEW_${Date.now()}`,
              templateName: '真实验收档案模板审核流程',
              businessType: 'ARCHIVE_TEMPLATE',
              enabled: true,
              steps: [
                {
                  stepOrder: 1,
                  stepName: '交付负责人审核',
                  mode: 'SINGLE',
                  approverType: 'role',
                  approverValues: ['DELIVERY_MANAGER'],
                },
              ],
            }),
          },
          201,
        )
      ).data;
      const templates = (await expectAuthenticatedGet('/archive-templates', admin.accessToken))
        .data as ArchiveTemplateListItem[];
      const target = templates.find((template) => template.currentPublishedVersion !== null);
      if (!target) throw new Error('A published archive template is required for review E2E');

      const draft = (
        await expectAuthenticatedRequest<ArchiveTemplateVersionData>(
          `/archive-templates/${target.id}/versions`,
          admin.accessToken,
          { method: 'POST', body: JSON.stringify({}) },
          201,
        )
      ).data;
      expect(draft.status).toBe('DRAFT');

      const review = (
        await expectAuthenticatedRequest<{ id: string; status: string }>(
          `/archive-template-versions/${draft.id}/submit-review`,
          admin.accessToken,
          { method: 'POST', body: JSON.stringify({}) },
          201,
        )
      ).data;
      expect(review).toEqual(
        expect.objectContaining({ id: expect.any(String), status: 'PENDING' }),
      );
      const reviewDetail = await expectAuthenticatedGet(
        `/file-reviews/${review.id}`,
        admin.accessToken,
      );
      expect(reviewDetail.data).toEqual(
        expect.objectContaining({ approvalTemplateId: configuredFlow.id }),
      );

      await expectAuthenticatedRequest(
        `/file-reviews/${review.id}/approve`,
        reviewer.accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ comment: 'archive template review E2E approved' }),
        },
        201,
      );

      const publishedTemplates = (
        await expectAuthenticatedGet('/archive-templates', admin.accessToken)
      ).data as ArchiveTemplateListItem[];
      expect(publishedTemplates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: target.id,
            currentPublishedVersion: expect.objectContaining({ status: 'PUBLISHED' }),
          }),
        ]),
      );
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
        '/standards/summary',
        '/standards/category-counts?dimension=DELIVERY_STAGE',
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
        '/standards/summary',
        '/standards/category-counts?dimension=DELIVERY_STAGE',
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
