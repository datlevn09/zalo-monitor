# Zalo Monitor — Architecture Overview

**Mục đích:** SaaS monitor + reply nhóm/DM Zalo cho doanh nghiệp Việt Nam. Multi-tenant.
KHÔNG phải chatbot — KHÔNG có agent AI tự reply. Chỉ ĐỌC + đồng bộ dữ liệu, gửi tin chỉ khi user chủ động bấm trên web UI.

**Repo:** `github.com/datlevn09/zalo-monitor` (private). Branch chính: `main`.
**Domain:** `zalo.datthongdong.com` (web), `api.datthongdong.com` (backend).

---

## Architecture (sau migrate khỏi OpenClaw)

```
┌─────────────────────┐     ┌──────────────────────────────┐     ┌──────────────────────────┐
│  Khách (web)        │     │  NAS Synology (host)         │     │  VPS / máy khách         │
│  zalo.datthongdong  │     │  /volume2/docker/zalo-monitor│     │  (mỗi khách 1 VPS)       │
│  ─────────          │     │  ─────────────────           │     │  ────────────────         │
│  Next.js dashboard  │◄───►│  zalo-monitor-dashboard-1    │     │  ~/.zalo-monitor/         │
│                     │     │  zalo-monitor-backend-1      │◄───►│  zalo-listener.mjs        │
│                     │     │  zalo-monitor-postgres-1     │     │  systemd user service     │
│                     │     │  zalo-monitor-redis-1        │     │  ────────────────         │
│                     │     │                              │     │  spawn openzca CLI        │
│                     │     │                              │     │  (profile: zalo-monitor)  │
└─────────────────────┘     └──────────────────────────────┘     └──────────────────────────┘
                                                                              │
                                                                              ▼
                                                                          [Zalo cloud]
```

**KEY POINTS:**
- **KHÔNG còn OpenClaw** — đã bỏ vì OpenClaw có embedded AI agent tự reply, gây spam.
- Listener chỉ là Node.js script wrapper quanh `openzca` CLI, READ-ONLY.
- Mỗi khách (tenant) → 1 listener service trên VPS riêng → 1 profile openzca riêng (`zalo-monitor`).
- Khách KHÔNG cần OpenClaw nữa, chỉ cần Node + openzca.

---

## Components

### 1. Backend (`/backend`) — Fastify + Prisma + Postgres
- Routes:
  - `/api/auth/*` — login, register, forgot/reset/change password (Gmail SMTP)
  - `/api/groups/*` — list groups, send messages, upload media (multipart)
  - `/api/messages` — list messages (filter `deletedAt`, query `?showDeleted=1` cho dev email)
  - `/api/zalo/connection-status` — `connected` dựa trên `zaloLoggedInTenants` map (chính xác)
  - `/api/zalo/reconnect` — queue action `login_zalo` cho listener
  - `/api/setup/inject.sh` — return bash install script per tenant+secret
  - `/api/setup/hook-files/{file}` — serve listener mjs, sh, dockerfile
  - `/api/setup/qr-push` — listener push QR data URL → store in qrStore
  - `/api/setup/zalo-status` — listener báo `loggedIn:true|false` mỗi 30s → cập nhật `zaloLoggedInTenants`
  - `/api/setup/pending-actions` — listener poll, nhận action `login_zalo`
  - `/api/setup/pending-sends` — listener poll, lấy items từ `send_queue` DB
  - `/webhook/zalo` — listener forward incoming Zalo messages
- Static: `/uploads/<tenantId>/<file>` — serve uploaded media files
- Auth: JWT (header Authorization Bearer) + per-tenant `webhookSecret` cho listener
- **In-memory state maps** (mất khi restart):
  - `hookPings` — listener service alive (TTL 10min)
  - `zaloLoggedInTenants` — Zalo logged in (TTL 5min, source of truth)
  - `qrStore` — QR pending (TTL 90s)
  - `pendingActions` — actions queue (TTL 5min auto cleanup)

### 2. Dashboard (`/dashboard`) — Next.js 16 App Router
- Pages chính:
  - `/login`, `/register`, `/forgot-password`, `/reset-password`
  - `/setup` — wizard cài đặt
  - `/dashboard` (overview), `/dashboard/groups` (list nhóm), `/dashboard/groups/[id]` (chat detail)
  - `/dashboard/settings` — Zalo của tôi (tabs Linux/Docker/Mac), bảo mật, đổi mật khẩu
  - `/dashboard/settings/channels` — bật/tắt kênh, lệnh cài, đồng bộ dữ liệu cũ
  - `/super-admin/*` — auth riêng (token/password bcrypt), CRUD tenants
  - `/docs/install-zalo` — hướng dẫn 3 platform
- Compose UI hỗ trợ: drag-drop, paste image, file picker → upload → send

### 3. Listener (`/plugin/hooks/zalo-monitor/`)
- `zalo-listener.mjs` — daemon script: spawn openzca listen, poll backend cho actions/sends, ping zalo-status
- `zalo-history-import.sh` — bash 1-line: tự cài Node + npm + openzca + better-sqlite3 + chạy script import
- `zalo-history-push.mjs` — đọc SQLite Zalo PC App (Mac/Win) → POST batch lên backend
- `Dockerfile` — image cho NAS Synology / Windows Docker

### 4. Database Schema (Prisma + Postgres)
- `Tenant` (companies), `User` (per-user webhookSecret), `Group` (Zalo nhóm — có `isDirect` để biết DM)
- `Message` (có `deletedAt` cho recall, `attachments` JSON), `MessageAnalysis` (AI label)
- `SendQueue` (text + mediaUrl + mediaType), `BoardAccess` (per-user view permission)
- `SystemSetting` (super admin password hash)

---

## Flows quan trọng

### A. Cài listener (khách mới)
1. Khách → web `/dashboard/settings/channels` → "Lấy lệnh cài đặt"
2. Backend gen `inject.sh?tenantId=X&webhookSecret=Y` (per-user secret)
3. Khách paste vào VPS (SSH). Script:
   - Cleanup hook OpenClaw cũ nếu có (KHÔNG can thiệp OpenClaw service của khách)
   - Tải `zalo-listener.mjs` về `~/.zalo-monitor/`
   - Tạo `.env` (BACKEND_URL, WEBHOOK_SECRET, TENANT_ID, PROFILE=zalo-monitor)
   - Tạo systemd user service `zalo-monitor-listener.service`
   - `systemctl --user enable --now`
4. Khách `openzca --profile zalo-monitor auth login` → scan QR
5. Listener detect login → POST `/zalo-status {loggedIn:true}` → web hiện "Đã kết nối"

### B. Nhận tin Zalo (read flow)
1. openzca listen stream → JSON line stdout
2. Listener parse → POST `/webhook/zalo` (header secret + tenantId)
3. Backend: validate secret per-tenant/per-user → tạo Group nếu chưa có → tạo Message
4. WebSocket emit → web realtime update
5. Auto-classify qua AI queue (Anthropic/OpenAI) → label COMPLAINT/RISK/OPPORTUNITY/NORMAL

### C. Gửi tin từ web (write flow)
1. User trên web: gõ text + drag-drop ảnh / paste / click 📎
2. Nếu có file: POST `/api/groups/:id/upload` (multipart) → backend lưu `/app/uploads/<tenantId>/<filename>` → trả URL public
3. POST `/api/groups/:id/send` `{text, mediaUrl, mediaType}` → backend tạo entry trong `send_queue` DB
4. Listener poll `/pending-sends` mỗi 10s → exec `openzca msg send -g --raw <thread> "<text>"` hoặc `msg image/video/file <thread> <URL> --caption "..."`
5. Listener POST `/ack-send {status:'sent'|'failed'}` → backend mark queue done
6. Optimistic message đã hiện trên UI từ bước 3

### D. Tin thu hồi (recall)
- Webhook detect `type='undo'` / `event='delete'` / `deletedMsgId` → `Message.updateMany set deletedAt`
- API `/api/messages` mặc định filter `deletedAt: null`
- `?showDeleted=1` + email khớp `process.env.DEV_EMAIL` (default `datle.dpro@gmail.com`) mới xem được

### E. Đồng bộ dữ liệu cũ (Zalo PC App SQLite)
- Khách vào `Settings → Kênh → Đồng bộ dữ liệu cũ`
- Copy lệnh 1-dòng: `curl ... zalo-history-import.sh | BACKEND_URL=... bash`
- Script: detect OS, install Node (brew/apt/dnf), npm install openzca + better-sqlite3, fetch + run zalo-history-push.mjs
- Push.mjs: detect SQLite path (cả `ZaloData/Database/_production/<uid>/MsgInfo.db` đời mới và `ZaloPC/data/<uid>/messages.db` đời cũ) → query → POST batch `/api/setup/sync-push`

### F. Multi-account (1 tenant, nhiều Zalo)
- **Cách 1 (recommended):** Mỗi nhân viên 1 máy → login dashboard với user riêng → lấy lệnh inject.sh chứa secret riêng → cài listener → scan Zalo cá nhân của họ
- **Cách 2 (1 máy, nhiều profile):** Cài listener nhiều instance với `PROFILE=user-a`, `PROFILE=user-b`... Chưa có UI quản lý.

---

## Deploy

### Code change → NAS
```bash
# Local
cd zalo-monitor && git push

# Sync src code lên NAS (rsync vì NAS không có git)
rsync -avz -e ssh --rsync-path=/usr/bin/rsync ./backend/src/ nas:/volume2/docker/zalo-monitor/backend/src/
rsync -avz -e ssh --rsync-path=/usr/bin/rsync ./dashboard/src/ nas:/volume2/docker/zalo-monitor/dashboard/src/
rsync -avz -e ssh --rsync-path=/usr/bin/rsync ./plugin/ nas:/volume2/docker/zalo-monitor/plugin/

# Rebuild + restart container
ssh nas "cd /volume2/docker/zalo-monitor && /volume2/@appstore/ContainerManager/usr/bin/docker compose -f docker-compose.nas.yml up -d --build --force-recreate backend dashboard"

# Nếu schema đổi: prisma db push
ssh nas "/volume2/@appstore/ContainerManager/usr/bin/docker exec zalo-monitor-backend-1 sh -c 'cd /app && npx prisma db push --skip-generate'"
```

### Listener trên VPS khách → update
- Khách chạy lại `inject.sh` (idempotent, tải listener mới + restart service)
- Hoặc SSH thẳng: `curl -fsSL .../zalo-listener.mjs -o ~/.zalo-monitor/zalo-listener.mjs && systemctl --user restart zalo-monitor-listener`

### SSH access
- NAS: `ssh nas` (qua CF tunnel) hoặc `ssh nas-lan` (LAN)
- VPS test: `ssh claw` (hostname `openclaw-test`, ip `165.245.178.39`)

---

## Test/dev VPS hiện tại
- Host: `claw` (ssh `claw`)
- Profile openzca: `zalo-monitor`
- Tenant: `clipfactory-5daa03` (id `cmogr1itt000cekio8ge2zuvn`)
- User: `ledatqx@gmail.com` / `Huy Dang`
- Listener service: `systemctl --user status zalo-monitor-listener`
- Logs: `journalctl --user -u zalo-monitor-listener -n 50`

---

## Email & Provider info

- SMTP: Gmail App Password (`datle.dpro@gmail.com`) — 500 mail/ngày, vượt thì migrate Resend/SendGrid/SES
- Backend env: `SMTP_HOST/PORT/USER/PASS/FROM` trong `docker-compose.nas.yml` (compose pass from `.env` NAS)
- AI: Anthropic Claude (label classification) — env `ANTHROPIC_API_KEY`
- Google OAuth: env `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` (login via Google)
- Super admin: `SUPER_ADMIN_TOKEN` env (fallback) hoặc bcrypt hash trong `SystemSetting` (đổi qua UI)

---

## Quan trọng — DON'T

- **Không bao giờ động vào OpenClaw của khách** (chỉ disable hook zalo-monitor cũ trong config nếu có, không stop service).
- **Không có agent AI auto-reply** — listener chỉ exec `openzca msg send` khi `send_queue` có entry (user chủ động).
- **Không dùng từ "thu thập", "theo dõi tin nhắn", "tải lịch sử"** trong UI/docs — dùng "đồng bộ dữ liệu".
- **Không link `chat.zalo.me`** trong UI — risk khách scan QR đăng nhập Zalo Web nhầm. Dùng `zalo://...` deep link.
