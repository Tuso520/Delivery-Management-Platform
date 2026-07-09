import {
  buildAttachmentPreview,
  canPreviewWithoutServer,
  needsServerPreview,
} from './attachment-preview.util';

describe('attachment preview routing', () => {
  it('routes uploaded recordings to the inline video viewer without server conversion', async () => {
    const preview = await buildAttachmentPreview({
      fileName: 'training-recording.mp4',
      fileExt: 'mp4',
      mimeType: 'video/mp4',
    });

    expect(preview).toMatchObject({
      previewKind: 'video',
      viewer: 'video',
      title: 'training-recording.mp4',
    });
    expect(canPreviewWithoutServer('mp4', 'video/mp4')).toBe(true);
    expect(needsServerPreview('mp4')).toBe(false);
  });
});
