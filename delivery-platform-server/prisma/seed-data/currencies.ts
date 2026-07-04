import { Prisma, type PrismaClient } from '@prisma/client';

export async function seedCurrencies(prisma: PrismaClient) {
  const currencies = [
    {
      currencyCode: 'CNY',
      currencyName: '人民币',
      currencySymbol: '¥',
      decimalPlaces: 2,
      status: 'Active',
    },
    {
      currencyCode: 'USD',
      currencyName: '美元',
      currencySymbol: '$',
      decimalPlaces: 2,
      status: 'Active',
    },
    {
      currencyCode: 'VND',
      currencyName: '越南盾',
      currencySymbol: '₫',
      decimalPlaces: 0,
      status: 'Active',
    },
    {
      currencyCode: 'THB',
      currencyName: '泰铢',
      currencySymbol: '฿',
      decimalPlaces: 2,
      status: 'Active',
    },
    {
      currencyCode: 'SGD',
      currencyName: '新加坡元',
      currencySymbol: 'S$',
      decimalPlaces: 2,
      status: 'Active',
    },
    {
      currencyCode: 'IDR',
      currencyName: '印尼盾',
      currencySymbol: 'Rp',
      decimalPlaces: 0,
      status: 'Active',
    },
    {
      currencyCode: 'MYR',
      currencyName: '马来西亚林吉特',
      currencySymbol: 'RM',
      decimalPlaces: 2,
      status: 'Active',
    },
    {
      currencyCode: 'OMR',
      currencyName: '阿曼里亚尔',
      currencySymbol: 'ر.ع.',
      decimalPlaces: 3,
      status: 'Active',
    },
    {
      currencyCode: 'EUR',
      currencyName: '欧元',
      currencySymbol: '€',
      decimalPlaces: 2,
      status: 'Active',
    },
    {
      currencyCode: 'AED',
      currencyName: '阿联酋迪拉姆',
      currencySymbol: 'د.إ',
      decimalPlaces: 2,
      status: 'Active',
    },
  ];

  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { currencyCode: currency.currencyCode },
      update: {},
      create: currency,
    });
  }

  const cnyRates = {
    USD: 0.147051,
    EUR: 0.129152,
    VND: 3875.968992,
    THB: 4.868472,
    MYR: 0.609422,
    IDR: 2631.578947,
    SGD: 0.190518,
    OMR: 0.05654,
    AED: 0.540042,
  } as const;
  const rateDate = new Date('2026-06-24T00:00:00.000Z');
  for (const [currencyCode, value] of Object.entries(cnyRates)) {
    for (const pair of [
      {
        fromCurrency: 'CNY',
        toCurrency: currencyCode,
        rate: new Prisma.Decimal(value),
      },
      {
        fromCurrency: currencyCode,
        toCurrency: 'CNY',
        rate: new Prisma.Decimal(1).div(value),
      },
    ]) {
      const existing = await prisma.exchangeRate.findUnique({
        where: {
          fromCurrency_toCurrency_rateDate: {
            fromCurrency: pair.fromCurrency,
            toCurrency: pair.toCurrency,
            rateDate,
          },
        },
        select: { isLocked: true },
      });
      if (existing?.isLocked) continue;
      await prisma.exchangeRate.upsert({
        where: {
          fromCurrency_toCurrency_rateDate: {
            fromCurrency: pair.fromCurrency,
            toCurrency: pair.toCurrency,
            rateDate,
          },
        },
        create: {
          ...pair,
          rateDate,
          source: 'ExchangeRate-API Open Access',
        },
        update: {
          rate: pair.rate,
          source: 'ExchangeRate-API Open Access',
        },
      });
    }
  }

  console.log(`Seeded ${currencies.length} currencies`);
}
