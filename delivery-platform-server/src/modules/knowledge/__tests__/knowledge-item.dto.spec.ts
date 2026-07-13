import 'reflect-metadata';

import { validate } from 'class-validator';

import {
  CreateKnowledgeItemDto,
  CreateKnowledgeVersionDto,
  UpdateKnowledgeVersionDto,
} from '../dto/knowledge-item.dto';

describe('knowledge primary content DTO contract', () => {
  const categoryId = '1fd198ec-d255-40af-b3e2-3e1f533a52e0';
  const fileVersionId = '61f393a7-f0c0-4bf0-92e8-17482d8d7076';

  it.each([
    {
      contentType: 'FILE',
      fileVersionId,
      markdownContent: null,
      externalUrl: null,
    },
    {
      contentType: 'MARKDOWN',
      fileVersionId: null,
      markdownContent: '# 操作指引',
      externalUrl: null,
    },
    {
      contentType: 'LINK',
      fileVersionId: null,
      markdownContent: null,
      externalUrl: 'https://example.com/guide',
    },
  ])('accepts exactly one matching $contentType primary field', async (primary) => {
    const dto = Object.assign(new CreateKnowledgeItemDto(), {
      title: '操作指引',
      categoryId,
      ...primary,
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it.each([
    {
      contentType: 'FILE',
      fileVersionId,
      markdownContent: '# 重复主内容',
      externalUrl: null,
    },
    {
      contentType: 'MARKDOWN',
      fileVersionId,
      markdownContent: null,
      externalUrl: null,
    },
    {
      contentType: 'LINK',
      fileVersionId: null,
      markdownContent: null,
      externalUrl: null,
    },
  ])('rejects missing, duplicate or mismatched $contentType primary fields', async (primary) => {
    const dto = Object.assign(new CreateKnowledgeItemDto(), {
      title: '操作指引',
      categoryId,
      ...primary,
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'contentType' })]),
    );
  });

  it.each(['ftp://example.com/guide', 'javascript:alert(1)', 'not-a-url'])(
    'rejects a non-http(s) LINK URL: %s',
    async (externalUrl) => {
      const dto = Object.assign(new CreateKnowledgeItemDto(), {
        title: '操作指引',
        categoryId,
        contentType: 'LINK',
        externalUrl,
      });

      const errors = await validate(dto);

      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ property: 'externalUrl' })]),
      );
    },
  );

  it('requires every new version to declare content and its complete supporting-file list', async () => {
    const dto = Object.assign(new CreateKnowledgeVersionDto(), {
      version: 'V2.0',
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining(['contentType', 'supportingFileVersionIds']));
  });

  it('requires optimistic revision when replacing an editable version draft', async () => {
    const dto = Object.assign(new UpdateKnowledgeVersionDto(), {
      contentType: 'MARKDOWN',
      markdownContent: '# 修订',
      supportingFileVersionIds: [],
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'revision' })]),
    );
  });
});
