import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';

/** Documents the platform's canonical paginated payload inside the success envelope. */
export function ApiPaginatedResponse(description = '分页查询成功') {
  return applyDecorators(
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['code', 'message', 'data', 'timestamp', 'traceId'],
        properties: {
          code: { type: 'number', example: 0 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            required: ['items', 'page', 'pageSize', 'total'],
            properties: {
              items: { type: 'array', items: { type: 'object' } },
              page: { type: 'integer', minimum: 1, example: 1 },
              pageSize: { type: 'integer', minimum: 1, example: 20 },
              total: { type: 'integer', minimum: 0, example: 0 },
            },
          },
          timestamp: { type: 'string', format: 'date-time' },
          traceId: { type: 'string' },
        },
      },
    }),
  );
}
