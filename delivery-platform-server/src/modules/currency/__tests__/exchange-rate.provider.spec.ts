import { ExchangeRateProvider } from '../exchange-rate.provider';

describe('ExchangeRateProvider', () => {
  it('normalizes the open exchange-rate response into supported pairs', async () => {
    const request = jest.fn().mockResolvedValue({
      result: 'success',
      provider: 'https://www.exchangerate-api.com',
      time_last_update_unix: 1782259352,
      base_code: 'CNY',
      rates: {
        CNY: 1,
        USD: 0.14705,
        VND: 3878.22,
        OMR: 0.05661,
      },
    });
    const provider = new ExchangeRateProvider(request);

    const result = await provider.fetchLatest('CNY', ['USD', 'VND', 'OMR']);

    expect(result.source).toBe('ExchangeRate-API Open Access');
    expect(result.baseCurrency).toBe('CNY');
    expect(result.rateDate.toISOString()).toBe('2026-06-24T00:02:32.000Z');
    expect(result.rates).toEqual([
      { currencyCode: 'USD', rate: 0.14705 },
      { currencyCode: 'VND', rate: 3878.22 },
      { currencyCode: 'OMR', rate: 0.05661 },
    ]);
  });

  it('rejects incomplete provider responses', async () => {
    const provider = new ExchangeRateProvider(
      jest.fn().mockResolvedValue({ result: 'error' }),
    );

    await expect(provider.fetchLatest('CNY', ['USD'])).rejects.toThrow(
      '在线汇率服务返回异常',
    );
  });
});
