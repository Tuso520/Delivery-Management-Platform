# Architecture

## High-Level Design

```text
Browser
  |
  | HTTPS/HTTP
  v
Nginx frontend container
  |
  | /api/v1
  v
NestJS backend container
  |
  +--> MySQL 8        # relational business data
  +--> Redis 7        # cache/session/rate related data
  +--> MinIO          # file and attachment object storage
```

## Frontend

- Location: `delivery-platform-web/`
- Framework: Vue 3 + TypeScript + Vite.
- UI library: Arco Design Vue.
- State: Pinia.
- Routing: Vue Router hash routes.
- API access: Axios wrapper under `src/api/`.
- Shared preview UI: `src/components/AttachmentPreviewPane/` and preview modal wrappers.

## Backend

- Location: `delivery-platform-server/`
- Framework: NestJS 11 + TypeScript.
- ORM: Prisma 5.
- Database: MySQL 8.
- Object storage: MinIO.
- Auth: JWT, roles and permission guards.
- File preview: attachment/file preview services generate metadata, signed links and server-side HTML preview for Office-style files.

## Data Domains

- Project: ledger records, members, stages and project access.
- Archive: generated archive items, current files, review status and upload guidance.
- File and attachment: uploaded file metadata, storage path, version, current flag and review workflow.
- Knowledge: categories, articles, attachments, preview/download heat.
- Template: template category, attachment, remark, preview/download heat.
- Approval/review: pending, approved, rejected and diff context.
- Organization: departments, users, roles and permissions.

## Preview Strategy

- PDF: PDF.js canvas rendering in the browser.
- Images: browser image preview.
- DOCX/XLSX/PPTX: server extracts readable OpenXML content into read-only document/spreadsheet/presentation HTML.
- Legacy DOC/XLS/PPT: server extracts readable text and wraps it in document, spreadsheet or slide layouts.
- Markdown/text: rendered as read-only text/Markdown.

## Permission Model

- Menus and routes require permission codes.
- Buttons use permission guards where applicable.
- Backend controllers enforce JWT and permission checks.
- Project data is scoped by project membership or elevated roles.
