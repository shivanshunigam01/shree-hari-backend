# Shreehari Export House — Backend

Express + MongoDB (JSON fallback) + JWT API.

## Setup

```bash
npm install
copy .env.example .env
npm run dev
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch server |
| `npm start` | Start server |
| `npm run seed` | Seed admin/staff + demo masters |
| `npm test` | Vitest workflow tests |
| `npm run build` | Typecheck |

## Auth

`POST /api/auth/login` `{ email, password }` → `{ success, data: { token, user } }`

Send `Authorization: Bearer <token>` on other routes.

## Core routes

- Users: `/api/users`
- Applications: `/api/applications` (+ `/submit` `/approve` `/reject` `/request-changes` `/resubmit`)
- PDF: `POST /api/applications/:id/documents/generate` `{ type: invoice|packing_list|annexure|vgm|proforma }`
- Masters: `/api/masters/:table`
- Notifications: `/api/notifications`
- Dashboard: `/api/dashboard/summary`
- Audit: `/api/audit-logs`
- Docs UI: `/api/docs`
