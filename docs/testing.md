# Testing Guide

## Required Checks

```powershell
pnpm --filter ./delivery-platform-server type-check
pnpm --dir delivery-platform-web build
```

For UI changes, also perform browser verification for the changed pages.

## Browser Regression Scope

The current critical browser flows are:

- Login.
- Dashboard role-specific greeting.
- Project ledger list, search and row actions.
- Project archive stage tabs, upload guidance, item detail, upload entry and review entry.
- Knowledge base category list, file remarks, heat indicators and file title preview.
- Document template list and file title preview.
- File preview for Word, Excel, PowerPoint, PDF, image and Markdown.
- File review approval and rejection path.

## 2026-07-08 Verification Summary

Verified on production URL `http://42.193.176.248:8080`.

| Area | Result |
| --- | --- |
| Release id | `1df2a618471e` |
| Backend health | Passed |
| Frontend health | Passed |
| Admin login | Passed |
| Project manager login | Passed |
| Project ledger | 11 rows visible in admin UI |
| Project manager project API | 9 visible projects for `pm_wang` |
| Knowledge PDF preview | Passed |
| Knowledge Word preview | Passed |
| Knowledge Excel preview | Passed |
| Knowledge PPT preview | Passed, including legacy `.ppt` slide layout |
| Project archive | Stage tabs, upload guidance, review status and detail modal passed |

Generated screenshots and temporary artifacts are intentionally excluded from Git.
