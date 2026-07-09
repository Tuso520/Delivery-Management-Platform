import {
  resolveFilePreviewRoute,
  LARGE_IMAGE_THRESHOLD_BYTES,
} from './file-preview-route';

describe('resolveFilePreviewRoute', () => {
  it('routes editable OOXML files to ONLYOFFICE edit mode when allowed', () => {
    expect(
      resolveFilePreviewRoute({
        fileExt: 'docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 1024,
        requestedMode: 'edit',
        canEditOffice: true,
        onlyOfficeAvailable: true,
      }),
    ).toMatchObject({
      viewer: 'onlyoffice',
      category: 'office',
      mode: 'edit',
      editable: true,
    });
  });

  it('keeps legacy Office formats read-only', () => {
    expect(
      resolveFilePreviewRoute({
        fileExt: 'doc',
        mimeType: 'application/msword',
        fileSize: 1024,
        requestedMode: 'edit',
        canEditOffice: true,
        onlyOfficeAvailable: true,
      }),
    ).toMatchObject({
      viewer: 'onlyoffice',
      mode: 'view',
      editable: false,
      readonly: true,
    });
  });

  it('uses OpenSeadragon route only for large images', () => {
    expect(
      resolveFilePreviewRoute({
        fileExt: 'png',
        mimeType: 'image/png',
        fileSize: LARGE_IMAGE_THRESHOLD_BYTES + 1,
      }),
    ).toMatchObject({
      viewer: 'deep-zoom-image',
      category: 'image',
    });

    expect(
      resolveFilePreviewRoute({
        fileExt: 'png',
        mimeType: 'image/png',
        fileSize: LARGE_IMAGE_THRESHOLD_BYTES - 1,
      }),
    ).toMatchObject({
      viewer: 'image',
      category: 'image',
    });
  });

  it('routes specialized read-only formats to degraded preview categories', () => {
    expect(
      resolveFilePreviewRoute({
        fileExt: 'dxf',
        mimeType: 'application/dxf',
        fileSize: 1024,
      }),
    ).toMatchObject({
      viewer: 'cad',
      category: 'cad',
      editable: false,
    });

    expect(
      resolveFilePreviewRoute({
        fileExt: 'vsdx',
        mimeType:
          'application/vnd.ms-visio.drawing.main+xml',
        fileSize: 1024,
      }),
    ).toMatchObject({
      viewer: 'visio',
      category: 'visio',
      editable: false,
    });
  });
});
