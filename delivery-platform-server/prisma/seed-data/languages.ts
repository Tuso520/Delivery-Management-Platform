import type { PrismaClient } from '@prisma/client';
import { seedUiTranslations } from './ui-translations';

export async function seedLanguages(prisma: PrismaClient) {
  const languages = [
    {
      languageCode: 'zh-CN',
      languageName: '简体中文',
      status: 'Active',
    },
    {
      languageCode: 'en-US',
      languageName: 'English',
      status: 'Active',
    },
    {
      languageCode: 'vi-VN',
      languageName: 'Tiếng Việt',
      status: 'Inactive',
    },
    {
      languageCode: 'th-TH',
      languageName: 'ภาษาไทย',
      status: 'Inactive',
    },
    {
      languageCode: 'id-ID',
      languageName: 'Bahasa Indonesia',
      status: 'Inactive',
    },
    {
      languageCode: 'ar-OM',
      languageName: 'العربية',
      status: 'Inactive',
    },
    {
      languageCode: 'ms-MY',
      languageName: 'Bahasa Melayu',
      status: 'Inactive',
    },
  ];

  for (const language of languages) {
    await prisma.language.upsert({
      where: { languageCode: language.languageCode },
      update: { languageName: language.languageName, status: language.status },
      create: language,
    });
  }

  await seedUiTranslations(prisma);
  console.log(`Seeded ${languages.length} languages`);
}
