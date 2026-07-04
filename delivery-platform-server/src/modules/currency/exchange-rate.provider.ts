export interface OnlineExchangeRate {
  currencyCode: string;
  rate: number;
}

export interface OnlineExchangeRateResult {
  baseCurrency: string;
  rateDate: Date;
  source: string;
  sourceUrl: string;
  rates: OnlineExchangeRate[];
}

interface OpenExchangeRateResponse {
  result?: string;
  provider?: string;
  time_last_update_unix?: number;
  base_code?: string;
  rates?: Record<string, number>;
}

export type ExchangeRateRequest = (
  url: string,
) => Promise<OpenExchangeRateResponse>;

async function defaultRequest(url: string): Promise<OpenExchangeRateResponse> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`在线汇率服务请求失败: HTTP ${response.status}`);
  }
  return (await response.json()) as OpenExchangeRateResponse;
}

export class ExchangeRateProvider {
  constructor(private readonly request: ExchangeRateRequest = defaultRequest) {}

  async fetchLatest(
    baseCurrency: string,
    targetCurrencies: string[],
  ): Promise<OnlineExchangeRateResult> {
    const normalizedBase = baseCurrency.toUpperCase();
    const sourceUrl = `https://open.er-api.com/v6/latest/${normalizedBase}`;
    const response = await this.request(sourceUrl);

    if (
      response.result !== 'success' ||
      response.base_code !== normalizedBase ||
      !response.time_last_update_unix ||
      !response.rates
    ) {
      throw new Error('在线汇率服务返回异常');
    }

    const rates = targetCurrencies
      .map((currencyCode) => currencyCode.toUpperCase())
      .filter((currencyCode) => currencyCode !== normalizedBase)
      .map((currencyCode) => ({
        currencyCode,
        rate: response.rates?.[currencyCode],
      }))
      .filter(
        (item): item is OnlineExchangeRate =>
          typeof item.rate === 'number' && item.rate > 0,
      );

    return {
      baseCurrency: normalizedBase,
      rateDate: new Date(response.time_last_update_unix * 1000),
      source: 'ExchangeRate-API Open Access',
      sourceUrl,
      rates,
    };
  }
}
