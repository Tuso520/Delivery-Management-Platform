import JSZip = require('jszip');

import { parseXmindOutline } from '../xmind-parser';

describe('parseXmindOutline', () => {
  it('extracts a bounded outline from a modern XMind archive', async () => {
    const zip = new JSZip();
    zip.file(
      'content.json',
      JSON.stringify([
        {
          title: '交付计划',
          rootTopic: {
            title: '项目启动',
            children: {
              attached: [
                { title: '需求确认' },
                {
                  title: '设计审查',
                  children: { attached: [{ title: '客户签字' }] },
                },
              ],
            },
          },
        },
      ]),
    );
    const source = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(parseXmindOutline(source)).resolves.toEqual([
      {
        title: '交付计划',
        root: {
          title: '项目启动',
          children: [
            { title: '需求确认', children: [] },
            {
              title: '设计审查',
              children: [{ title: '客户签字', children: [] }],
            },
          ],
        },
      },
    ]);
  });

  it('extracts a legacy content.xml outline without expanding entities', async () => {
    const zip = new JSZip();
    zip.file(
      'content.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0">
        <sheet><title>旧版图</title><topic><title>根节点</title><children><topics type="attached"><topic><title>子节点</title></topic></topics></children></topic></sheet>
      </xmap-content>`,
    );
    const source = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(parseXmindOutline(source)).resolves.toEqual([
      {
        title: '旧版图',
        root: { title: '根节点', children: [{ title: '子节点', children: [] }] },
      },
    ]);
  });

  it('rejects archives without a supported content entry using a stable code', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', '{}');
    const source = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(parseXmindOutline(source)).rejects.toMatchObject({
      code: 'XMIND_CONTENT_MISSING',
    });
  });
});
