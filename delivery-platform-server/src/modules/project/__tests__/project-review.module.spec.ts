import { Test } from '@nestjs/testing';

import { PrismaModule, PrismaService } from '../../../database/prisma.service';
import { ProjectArchiveModule } from '../../project-archive/project-archive.module';
import { ReviewTaskService } from '../../review/review-task.service';
import { ReviewModule } from '../../review/review.module';
import { ProjectModule } from '../project.module';
import { ProjectService } from '../project.service';

describe('Project creation review module graph', () => {
  it('resolves the Project, ProjectArchive, and Review forward references', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ProjectModule, ProjectArchiveModule, ReviewModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(ProjectService)).toBeInstanceOf(ProjectService);
    expect(moduleRef.get(ReviewTaskService)).toBeInstanceOf(ReviewTaskService);

    await moduleRef.close();
  });
});
