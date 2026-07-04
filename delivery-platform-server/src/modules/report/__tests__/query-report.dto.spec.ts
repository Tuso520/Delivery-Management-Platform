import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { QueryReportDto } from '../dto/query-report.dto';

describe('QueryReportDto', () => {
  it('treats empty filters as omitted values', async () => {
    const dto = plainToInstance(QueryReportDto, {
      page: '1',
      pageSize: '20',
      reportType: '',
      status: '',
      dateFrom: '',
      dateTo: '',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.reportType).toBeUndefined();
    expect(dto.status).toBeUndefined();
    expect(dto.dateFrom).toBeUndefined();
    expect(dto.dateTo).toBeUndefined();
  });
});
