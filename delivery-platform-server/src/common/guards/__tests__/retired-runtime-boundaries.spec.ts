import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '../../..');
const SERVER_MODULES = resolve(SERVER_SRC, 'modules');
const REPOSITORY_ROOT = resolve(SERVER_SRC, '../..');
const WEB_SRC = resolve(REPOSITORY_ROOT, 'delivery-platform-web/src');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('retired runtime boundaries', () => {
  it('does not mount retired backend business modules', () => {
    const appModule = source(resolve(SERVER_SRC, 'app.module.ts'));
    const retiredModuleEntries = [
      'report/report.module.ts',
      'retrospective/retrospective.module.ts',
      'okr/okr.module.ts',
      'skill/skill.module.ts',
      'training/training.module.ts',
      'process-record/process-record.module.ts',
      'project-process/project-process.module.ts',
      'workflow/workflow.module.ts',
      'checklist/checklist.module.ts',
      'document-template/document-template.module.ts',
      'attachment/attachment.module.ts',
      'approval/approval.module.ts',
      'project-file-review/project-file-review.module.ts',
      'knowledge-article/knowledge-article.module.ts',
      'knowledge-file/knowledge-file.module.ts',
      'platform/retrospective.controller.ts',
      'platform/retrospective.service.ts',
      'platform/approval.controller.ts',
      'platform/approval.service.ts',
      'platform/approval-business.service.ts',
      'review/review.controller.ts',
      'review/review.service.ts',
      'knowledge/knowledge.controller.ts',
      'knowledge/knowledge.service.ts',
      'file/file-preview-route.ts',
    ];

    expect(
      retiredModuleEntries.filter((file) => existsSync(resolve(SERVER_MODULES, file))),
    ).toEqual([]);
    expect(appModule).not.toMatch(
      /\b(?:Report|Retrospective|Okr|Skill|Training|ProcessRecord|ProjectProcess|Workflow|Checklist|DocumentTemplate|Attachment|Approval)Module\b/u,
    );
  });

  it('keeps country and language capabilities read-only', () => {
    const countryController = source(resolve(SERVER_MODULES, 'country/country.controller.ts'));
    const languageController = source(resolve(SERVER_MODULES, 'language/language.controller.ts'));
    const countryApi = source(resolve(WEB_SRC, 'api/country.ts'));
    const languageApi = source(resolve(WEB_SRC, 'api/language.ts'));

    expect(countryController).not.toMatch(/@(Post|Put|Patch|Delete)\s*\(/u);
    expect(languageController).not.toMatch(/@(Post|Put|Patch|Delete)\s*\(/u);
    expect(countryApi).not.toMatch(/request\.(?:post|put|patch|delete)\b/u);
    expect(languageApi).not.toMatch(/request\.(?:post|put|patch|delete)\b/u);
  });

  it('does not restore retired frontend API or type contracts', () => {
    const retiredFiles = [
      'api/report.ts',
      'api/retrospective.ts',
      'api/okr.ts',
      'api/skill.ts',
      'api/training.ts',
      'api/process-record.ts',
      'api/workflow.ts',
      'api/checklist.ts',
      'api/template.ts',
      'api/attachment.ts',
      'types/report.ts',
      'types/retrospective.ts',
      'types/okr.ts',
      'types/skill.ts',
      'types/training.ts',
      'types/process-record.ts',
      'types/workflow.ts',
      'types/checklist.ts',
      'types/template.ts',
      'types/attachment.ts',
    ];

    expect(retiredFiles.filter((file) => existsSync(resolve(WEB_SRC, file)))).toEqual([]);
  });

  it('uses only the target notification-rule route and internal notification creation', () => {
    const notificationApi = source(resolve(WEB_SRC, 'api/notification.ts'));
    const systemTypes = source(resolve(WEB_SRC, 'types/system.ts'));
    const notificationController = source(
      resolve(SERVER_MODULES, 'notification/notification.controller.ts'),
    );
    const notificationRuleController = source(
      resolve(SERVER_MODULES, 'notification/notification-rule.controller.ts'),
    );

    expect(notificationApi).not.toContain('/notifications/rules');
    expect(notificationApi).not.toMatch(
      /request\.post<NotificationItem>\(['"]\/notifications['"]/u,
    );
    expect(notificationController).not.toMatch(/@Post\s*\(/u);
    expect(notificationController).not.toMatch(/['"]rules(?:\/|['"])/u);
    expect(notificationRuleController).toContain("@Controller('notification-rules')");
    expect(systemTypes).not.toContain('interface NotificationRule');
  });

  it('keeps knowledge and review on their unified target contracts', () => {
    const knowledgeApi = source(resolve(WEB_SRC, 'api/knowledge.ts'));
    const reviewApi = source(resolve(WEB_SRC, 'api/review.ts'));

    expect(knowledgeApi).not.toMatch(
      /knowledge-(?:articles?|files?)|\b(?:getArticles|getFiles|createArticle|createFile)\b/u,
    );
    expect(reviewApi).not.toMatch(/['"`]\/(?:approvals?|reviews?)(?:\/|['"`])/u);
    expect(reviewApi).toContain('/file-reviews');
  });

  it('uses only explicit all/any permission requirements in controllers', () => {
    const permissionsDecorator = source(
      resolve(SERVER_SRC, 'common/decorators/permissions.decorator.ts'),
    );
    const controllerSources = [...readControllerSources(SERVER_MODULES)].join('\n');

    expect(permissionsDecorator).not.toMatch(/export const Permissions\b/u);
    expect(controllerSources).not.toMatch(/@Permissions\s*\(/u);
    expect(controllerSources).not.toMatch(/import\s*\{[^}]*\bPermissions\b[^}]*\}/u);
  });
});

function readControllerSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return readControllerSources(path);
    return entry.name.endsWith('.controller.ts') ? [source(path)] : [];
  });
}
