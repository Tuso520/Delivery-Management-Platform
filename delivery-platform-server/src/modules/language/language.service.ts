import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class LanguageService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.language.findMany({
      where: { status: 'Active' },
      orderBy: [{ languageName: 'asc' }, { languageCode: 'asc' }],
    });
  }
}
