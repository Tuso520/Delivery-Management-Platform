import JSZip = require('jszip');

import { parsePptxOutline } from '../pptx-outline-parser';

describe('parsePptxOutline', () => {
  it('extracts ordered, decoded text from a real PPTX-shaped archive', async () => {
    const archive = new JSZip();
    archive.file('ppt/slides/slide2.xml', slideXml(['第二页', '交付完成']));
    archive.file('ppt/slides/slide1.xml', slideXml(['生产回归 &amp; 验证', 'DMP-PPTX-PARSER']));

    const outline = await parsePptxOutline(await archive.generateAsync({ type: 'nodebuffer' }));

    expect(outline).toEqual({
      slides: [
        {
          slideNumber: 1,
          title: '生产回归 & 验证',
          texts: ['生产回归 & 验证', 'DMP-PPTX-PARSER'],
        },
        { slideNumber: 2, title: '第二页', texts: ['第二页', '交付完成'] },
      ],
    });
  });

  it('rejects archives without slide XML', async () => {
    const archive = new JSZip();
    archive.file('[Content_Types].xml', '<Types/>');

    await expect(
      parsePptxOutline(await archive.generateAsync({ type: 'nodebuffer' })),
    ).rejects.toMatchObject({ code: 'PPTX_SLIDES_MISSING' });
  });
});

function slideXml(texts: string[]): string {
  return `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>${texts
    .map((text) => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`)
    .join('')}</p:cSld></p:sld>`;
}
