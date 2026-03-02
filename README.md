# 3R Laundry Services App

This project contains the source code for the 3R Laundry Services system, comprising a Backend API, a User App, and an Admin App.

## Project Structure

- `backend/`: Node.js + Express + SQLite (Sequelize) API.
- `user-app/`: React Native (Expo) application for Students.
- `admin-app/`: React Native (Expo) application for Staff (Riders, Washers, Admins).

## Prerequisites

- Node.js (v16+)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app on your mobile device (Android/iOS)

## Setup & Running

### 1. Backend

The backend handles authentication, database management, and business logic.

```bash
cd backend
npm install
npm start
```
The server will run on `http://localhost:5000`. It uses a local SQLite database file created automatically on first run.

### 2. User App (Student)

```bash
cd user-app
npm install
npm start
```
Scan the QR code with Expo Go.
- **Login**: Any phone/password (Mocked for UI demo, connect to backend in `src/screens/LoginScreen.js`)
- **Features**: Book Pickup, View Active Orders.

### 3. Admin App (Staff)

```bash
cd admin-app
npm install
npm start
```
- **Login Credentials (Mocked)**:
  - Admin: `admin` / `admin`
  - Rider: `rider` / (any)
  - Washer: `washer` / (any)
  - Receptionist: `receptionist` / (any)

## Configuration

- **Database**: configured in `backend/src/config/database.js`. Defaults to SQLite.
- **API URL**: Update `API_URL` in `user-app/src/screens/LoginScreen.js` and `admin-app/src/screens/LoginScreen.js` to point to your backend IP address (e.g., `http://192.168.x.x:5000`) if testing on a physical device.

## Features Implemented

- **Authentication**: Role-based (Student, Rider, Washer, Admin).
- **Booking**: Pickup scheduling with clothes count.
- **Code System**: Unique pickup/release codes for security.
- **Order Tracking**: Status updates from Pickup to Delivery.

## System Architecture

- Backend API: Node.js + Express with Sequelize ORM using SQLite for local development. JWT-based authentication and role-based access control guard protected routes.
- Admin App: React Native (Expo) targeting mobile and web, used by staff (Rider/Washer/Receptionist/Admin).
- User App: React Native (Expo) for students to manage subscriptions and orders.
- Data Flow: 
  - User App calls `/auth` and `/student` endpoints for registration, login, plans, subscriptions, and orders.
  - Admin App calls `/admin` endpoints for operations (users, orders, codes, plans, payments, settings).
  - Server-Sent Events (SSE) available via `/admin/events` for lightweight real-time keep-alive.
- RBAC: Middleware validates JWT then enforces allowed roles per route.

## Data Flow & Sync

- Registration setup: Admin updates `/admin/registration-fields` and `/admin/schools`, which broadcasts `registration_fields_updated` and `schools_updated`, clears the registration config cache, and refreshes `/student/registration-config`.
- Student onboarding: User App signup/profile screens load `/student/registration-config` for active fields and schools, and listen for SSE changes through SyncContext.
- Runtime sync: Student app syncs incremental changes through `/student/sync/pull` and receives immediate updates over `/student/events`.
- Admin user forms: Head Admin add/edit user forms load active schools from `/admin/schools` and refresh on `schools_updated` SSE events.

## Monitoring & Alerts

- Sync failures: Sync events are audited in `AuditLog`, and failed events notify admins via in-app `Notification` entries.
- Frontend errors: Client-side failures post to `/admin/front-logs` or `/student/front-logs`, with recent logs available at `/admin/front-logs/recent`.
- API errors: Non-2xx responses are logged to `backend/src/logs/api-errors.log`.

## Authentication & RBAC

- JWT issuance on login/register containing `user_id` and `role`.
- Middleware:
  - Token verification loads `req.user`.
  - Role verification enforces route-level access for `student`, `rider`, `washer`, `receptionist`, `admin`.
- Environment:
  - `JWT_SECRET` to sign tokens (defaults to `secret` for development).
  - `PORT` (defaults to `5000`).

## API Endpoints

### Auth (`/auth`)
- `POST /auth/register` — Create user account (student or staff via role).
- `POST /auth/login` — Login with phone and password; returns JWT and user.
- `POST /auth/accept-invite` — Register staff via invite token.

### Student (`/student`)
- `GET /student/plans` — List available subscription plans.
- `GET /student/subscription?user_id={id}` — Get active subscription with plan details.
- `POST /student/subscribe` — Activate a plan for a user.
- `GET /student/orders?user_id={id}` — List user’s orders.
- `POST /student/book` — Create pickup order and generate pickup code.

### Admin (`/admin`) — requires staff JWT; many routes are Admin-only
- Logs/Monitoring:
  - `POST /admin/front-logs` — Append frontend boot/runtime errors (no auth).
  - `GET /admin/front-logs/recent?lines={n}` — Tail recent frontend logs (admin only).
  - `GET /admin/audit-logs?limit={n}` — List recent audit logs (admin only).
- Overview/Users:
  - `GET /admin/metrics` — Aggregated daily metrics (admin only).
  - `GET /admin/users` — List users (admin only).
  - `PUT /admin/users/:id` — Update user fields including role (admin only).
  - `DELETE /admin/users/:id` — Delete user (admin only).
- Notifications:
  - `GET /admin/notifications` — List notifications (admin only).
  - `POST /admin/notifications` — Create notification (admin only).
  - `DELETE /admin/notifications/:id` — Delete notification (admin only).
- Staff Invites:
  - `POST /admin/invite` — Create invite token (admin only).
  - `GET /admin/invites` — List invites (admin only).
  - `PUT /admin/invites/:id` — Update invite (admin only).
  - `DELETE /admin/invites/:id` — Delete invite (admin only).
- Orders:
  - `GET /admin/orders?status={status}` — List orders with optional status filter.
  - `POST /admin/orders` — Admin creates an order.
  - `PUT /admin/orders/:id` — Update order fields.
  - `DELETE /admin/orders/:id` — Delete order.
  - `PUT /admin/orders/:id/status` — Staff update order status; washer/admin can set `processing`/`ready` (auto-generates release code).
- Code Verification:
  - `POST /admin/verify-code` — Verify pickup/release code; admin can override.
- Payments:
  - `GET /admin/payments` — List payments (admin only).
  - `POST /admin/payments` — Create payment record (admin only).
  - `PUT /admin/payments/:id` — Update payment status/receipt (admin only).
  - `DELETE /admin/payments/:id` — Delete payment (admin only).
  - `POST /admin/payments/paystack/webhook` — Handle Paystack webhook (simplified).
- Settings & Integrations:
  - `GET /admin/settings` — Get app settings (admin only).
  - `PUT /admin/settings` — Update branding/theme/payments/integrations (admin only).
  - `GET /admin/integrations` — Get payments/integrations snapshot (admin only).
  - `PUT /admin/integrations/paystack` — Enable and set Paystack public key (admin only).
- SSE:
  - `GET /admin/events` — Server-Sent Events ping stream.

## Database Schema

- Users
  - `user_id`, `full_name`, `phone_number` (unique), `password` (hash), optional `student_id`, `school`, `hostel_address`, `role` (enum), `status`.
- Orders
  - `order_id`, `user_id`, `pickup_date`, `pickup_time_slot`, `clothes_count`, `extra_clothes`, `extra_cost`, `status` (enum), optional delivery fields and payment status.
- Codes
  - `code_id`, `order_id`, optional `student_id`, optional `clothes_count`, `code_value` (unique), `type` (pickup|release), `used`, `expires_at`.
- Notifications
  - `notification_id`, `user_id`, `message`, `channel` (app|whatsapp), `read_status`.
- Payments
  - `payment_id`, `user_id`, optional `order_id`, `amount`, `currency`, `status`, `method`, `reference`, `receipt_url`.
- Plans
  - `plan_id`, `name`, `price`, `duration_days`, `max_pickups`, `description`.
- Subscriptions
  - `subscription_id`, `user_id`, `plan_id`, `start_date`, `end_date`, `remaining_pickups`, `status`.
- Audit Logs
  - `log_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `details`, `created_at`.

## Deployment

- Development
  - Backend: `cd backend && npm install && npm start` (default `http://localhost:5000`).
  - User App (mobile/web): `cd user-app && npm install && npm start` or run `start_user_app_web.bat`.
  - Admin App (mobile/web): `cd admin-app && npm install && npm start` or run `start_admin_app_web.bat`.
- Environment Variables
  - `PORT`, `JWT_SECRET`. For payments/integrations, configure via admin settings endpoints.
- Production Notes
  - Switch Sequelize dialect to Postgres and configure managed database; set proper `JWT_SECRET`; enable CORS appropriately; harden webhook signature validation.

## Admin Web Troubleshooting

- Error: `APIError {url: /admin/overview, method: get, status: 404}`
  - Root cause: Admin web build served from a static server without the backend API routes, so `/admin/overview` is not mounted.
  - Fix: Serve admin web from the backend server on the same origin, or set `EXPO_PUBLIC_API_URL`/`REACT_APP_API_URL` to the backend host so requests target the API server.
  - Code: Admin web now prefers explicit API URL envs and uses the runtime origin for production builds.
- Error: `APIError {url: /admin/sync/pull, method: get, status: 404}` and `SyncContext: Batch sync error`
  - Root cause: Sync polling hit the same static-only host without backend routes.
  - Fix: Sync polling uses the same API base URL and logs normalized errors to `/admin/front-logs` for visibility.
- Error: `SyncContext: Error`
  - Root cause: SSE connection created against a non-API origin or missing token.
  - Fix: SSE now uses the resolved API base URL and logs failures for troubleshooting.
- Error: `Error fetching overview data`
  - Root cause: API base URL resolution pointed to a host without `/admin/overview`.
  - Fix: Overview screen shows a user-visible error banner and logs details to `/admin/front-logs`.

## Testing

- Backend unit/integration: `cd backend && npm test` (Jest + Supertest).
- E2E scripts (node-driven):
  - `npm run e2e:admin` — Head admin plan management web flow.
  - `npm run e2e:user` — User app web boot flow.
- Smoke scripts:
  - `npm run smoke:admin`, `npm run smoke:student`.

## Admin Guide

- Login using admin credentials or accept-invite flow.
- Use Dashboard to:
  - View metrics and recent activity.
  - Manage users and roles; issue staff invites.
  - Create/edit/delete orders; update statuses. When setting to `ready`, a release code is auto-generated and sent.
  - Verify codes and apply overrides when necessary.
  - Manage notifications and payments.
  - Configure branding, theme, and integrations (Paystack).
  - Monitor frontend logs and API error tails to diagnose issues.

## Student Guide

- Register and login with phone number.
- Browse plans, subscribe to a plan, and view subscription details.
- Book pickups with a valid time window; receive a pickup code.
- Track order status updates and receive notifications; present release code at collection.
