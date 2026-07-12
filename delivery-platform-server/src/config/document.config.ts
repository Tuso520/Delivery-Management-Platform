import { registerAs } from '@nestjs/config';

export function resolveDocumentConfig() {
  return {
    onlyOfficeDocsUrl: process.env.ONLYOFFICE_DOCS_URL || '',
    onlyOfficeJwtSecret: process.env.ONLYOFFICE_JWT_SECRET || '',
    publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL || '',
  };
}

export default registerAs('document', resolveDocumentConfig);
