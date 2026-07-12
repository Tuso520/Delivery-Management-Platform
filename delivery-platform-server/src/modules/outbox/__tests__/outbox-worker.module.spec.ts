import { Test } from '@nestjs/testing';

import { PrismaService } from '../../../database/prisma.service';
import { OutboxWorkerModule } from '../../../workers/outbox-worker.module';
import { IntegrationService } from '../../platform/integration.service';
import { OutboxDispatcherService } from '../outbox-dispatcher.service';

describe('OutboxWorkerModule', () => {
  it('wires the dispatcher to the external integration sender without loading the full platform', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OutboxWorkerModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    await moduleRef.init();

    expect(moduleRef.get(OutboxDispatcherService)).toBeDefined();
    expect(moduleRef.get(IntegrationService)).toBeDefined();

    await moduleRef.close();
  });
});
