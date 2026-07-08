# UI/UX and Arco Design

## Current Standard

The platform uses Arco Design Vue as the primary UI component library.

## Migration Status

- `@arco-design/web-vue@2.58.0` is installed and imported from `delivery-platform-web/src/main.ts`.
- New pages and new business components should use Arco Design Vue by default.
- Existing pages should be migrated as part of related maintenance, not through unrelated broad rewrites.

## Migration Priority

When touching older UI, prioritize these components:

- Button
- Form
- Input
- Select
- Table
- Modal
- Drawer
- Pagination
- Message
- Notification

## Acceptance Requirements

- `pnpm --dir delivery-platform-web build` passes.
- Key pages have no visual regression.
- Form validation, pagination, modal confirmation and error feedback work.
- Loading, empty, error, disabled, readonly, no-permission and validation states are checked.
- No additional UI component library is introduced.

## Layout Rules

- Operational pages should be compact and work-focused.
- Keep filters minimal and aligned in one row where possible.
- Avoid nested cards and oversized decorative surfaces.
- Use internal scrolling for dense list frames instead of unstable outer page scrolling.
- Keep file title preview interactions consistent across knowledge base and templates.
