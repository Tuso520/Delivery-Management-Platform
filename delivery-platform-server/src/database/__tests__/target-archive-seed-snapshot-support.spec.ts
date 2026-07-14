import {
  type EmptyArchiveSeedSnapshotInput,
  isDeterministicEmptyArchiveSeedSnapshot,
} from '../../../prisma/target-foundation-migration-support';

describe('empty archive seed snapshot migration support', () => {
  const valid: EmptyArchiveSeedSnapshotInput = {
    archiveTemplateVersionId: 'version-1',
    archiveFileCount: 0,
    templateFolders: [
      { id: 'template-folder-1', stableKey: 'folder-1' },
      { id: 'template-folder-2', stableKey: 'folder-2' },
    ],
    templateItems: [
      { id: 'template-item-1', folderId: 'template-folder-1', stableKey: 'item-1' },
      { id: 'template-item-2', folderId: 'template-folder-2', stableKey: 'item-2' },
    ],
    projectFolders: [
      {
        id: 'project-folder-1',
        sourceTemplateFolderId: 'template-folder-1',
        sourceStableKey: 'folder-1',
        archivedAt: null,
      },
      {
        id: 'project-folder-2',
        sourceTemplateFolderId: 'template-folder-2',
        sourceStableKey: 'folder-2',
        archivedAt: null,
      },
    ],
    projectEntries: [
      {
        id: 'project-entry-1',
        folderId: 'project-folder-1',
        templateVersionId: 'version-1',
        sourceTemplateItemId: 'template-item-1',
        sourceStableKey: 'item-1',
        archivedAt: null,
      },
      {
        id: 'project-entry-2',
        folderId: 'project-folder-2',
        templateVersionId: 'version-1',
        sourceTemplateItemId: 'template-item-2',
        sourceStableKey: 'item-2',
        archivedAt: null,
      },
    ],
  };

  it('accepts only a complete, file-free snapshot bound to one template version', () => {
    expect(isDeterministicEmptyArchiveSeedSnapshot(valid)).toBe(true);
  });

  it.each([
    ['contains an archive file', { archiveFileCount: 1 }],
    [
      'misses a source folder binding',
      {
        projectFolders: valid.projectFolders.map((folder, index) =>
          index === 0 ? { ...folder, sourceTemplateFolderId: null } : folder,
        ),
      },
    ],
    [
      'misses a source item binding',
      {
        projectEntries: valid.projectEntries.map((entry, index) =>
          index === 0 ? { ...entry, sourceTemplateItemId: null } : entry,
        ),
      },
    ],
    [
      'has a folder stable-key mismatch',
      {
        projectFolders: valid.projectFolders.map((folder, index) =>
          index === 0 ? { ...folder, sourceStableKey: 'unexpected-folder' } : folder,
        ),
      },
    ],
    [
      'has an item stable-key mismatch',
      {
        projectEntries: valid.projectEntries.map((entry, index) =>
          index === 0 ? { ...entry, sourceStableKey: 'unexpected-item' } : entry,
        ),
      },
    ],
    [
      'binds an item to the wrong project folder',
      {
        projectEntries: valid.projectEntries.map((entry, index) =>
          index === 0 ? { ...entry, folderId: 'project-folder-2' } : entry,
        ),
      },
    ],
    [
      'uses a different template version',
      {
        projectEntries: valid.projectEntries.map((entry, index) =>
          index === 0 ? { ...entry, templateVersionId: 'version-2' } : entry,
        ),
      },
    ],
    ['has fewer project entries', { projectEntries: valid.projectEntries.slice(1) }],
  ] satisfies Array<[string, Partial<EmptyArchiveSeedSnapshotInput>]>)(
    'rejects when %s',
    (_name, patch) => {
      expect(isDeterministicEmptyArchiveSeedSnapshot({ ...valid, ...patch })).toBe(false);
    },
  );
});
