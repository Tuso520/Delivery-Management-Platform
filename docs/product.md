# Product Overview

## Positioning

Delivery Management Platform is an internal delivery operations system for cross-country software and engineering delivery teams. It standardizes project ledgers, archives, document approval, knowledge reuse, templates, performance tracking and organization permissions.

## Primary Users

- System administrator: manages users, roles, global configuration and platform data.
- Delivery manager: monitors delivery risks, project progress, documents and reviews.
- Project manager: maintains project ledger, archive upload, file review and team coordination.
- Electrical/software engineers: upload and review professional files, read standards and templates.
- Purchase, finance and HSE: maintain related project files, approvals and risk records.
- Standard administrator: maintains knowledge base, document templates and process standards.

## Main Modules

| Area | Modules |
| --- | --- |
| Workspace | Dashboard, todo list, delivery risk overview |
| Project Management | Project ledger, project archive, file review, reports, retrospectives |
| Standards and Knowledge | Workflow, checklist templates, archive templates, document templates, knowledge base, tools, training |
| Performance and Team | OKR, monthly scoring, skill assessment |
| Organization and Permissions | Departments, users, roles, permission matrix |
| Operations | Country, currency, language, notification, approval config, logs, storage, integrations |

## Current Product Rules

- Knowledge categories are single-level only. Secondary context belongs in file title, remark or description.
- Knowledge and template files open preview by clicking the file title.
- Preview and download heat are shown in list rows.
- Project archive directories are generated from first-level delivery process stages.
- Archive item upload must go through review before becoming the current approved file version.
- Reviewers must be able to compare original and incoming files where applicable.
- Project ledger search is intentionally simple: one keyword search plus action buttons.

## Verified Test Accounts

| Role | Username | Password |
| --- | --- | --- |
| Administrator | `admin` | `Admin@123` |
| Project manager | `pm_wang` | `Pm@123456` |

Production verification on `2026-07-08` confirmed `pm_wang` can log in and see project data.
