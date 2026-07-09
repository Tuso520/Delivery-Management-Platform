import { registerAs } from '@nestjs/config';

export default registerAs('document', () => ({
  onlyOfficeDocsUrl: process.env.ONLYOFFICE_DOCS_URL || '',
  onlyOfficeJwtSecret: process.env.ONLYOFFICE_JWT_SECRET || '',
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL || '',
}));
