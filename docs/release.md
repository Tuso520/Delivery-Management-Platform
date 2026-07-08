# Release Notes

## 2026-07-08

### Changed

- Consolidated project documentation into GitHub-style `docs/` structure.
- Removed phase-based project folders from the repository layout.
- Improved legacy Office preview rendering:
  - `.ppt` now uses presentation slide layout.
  - `.xls` now uses spreadsheet table layout when readable text can be extracted.
  - `.doc` remains document layout.
- Expanded and verified project ledger, project archive, knowledge base and document template test data.
- Switched production deployment to Git based server pull flow.

### Verified

- Production release `1df2a618471e` deployed successfully.
- Browser verification completed for knowledge previews, project ledger and project archive.
- Data backup completed before migration.

## Earlier

See root [CHANGELOG.md](../CHANGELOG.md) for concise release history.
