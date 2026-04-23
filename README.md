# Zalo Monitor

> AI-powered dashboard theo dõi tin nhắn Zalo / Telegram / Lark cho doanh nghiệp Việt. Phân loại bằng AI, cảnh báo real-time, pipeline bán hàng — **miễn phí, open source**.

![License](https://img.shields.io/badge/license-MIT-blue) ![Node](https://img.shields.io/badge/node-18%2B-green) ![Stack](https://img.shields.io/badge/stack-Next.js%2015%20%2B%20Fastify-black)

## Tính năng

- 📱 Theo dõi mọi nhóm chat **Zalo / Telegram / Lark** trong 1 dashboard iOS-style
- 🤖 **AI tự phân loại** tin nhắn: cơ hội / khiếu nại / rủi ro / tích cực (Claude Haiku + keyword fallback)
- 🚨 Cảnh báo real-time khi có vấn đề khẩn cấp (gửi qua Zalo/Telegram/Lark/Email)
- 💼 Pipeline Kanban quản lý deal bán hàng
- 👥 Auto-extract khách hàng (phone, email, avatar) từ tin nhắn
- 📊 Báo cáo hàng ngày / tuần / tháng
- 🎙️ Chat với AI bằng tiếng Việt tự nhiên để query data
- 🌓 Dark mode + responsive mobile
- 🔐 Multi-tenant: 1 instance phục vụ nhiều doanh nghiệp, mỗi doanh nghiệp 1 webhook secret riêng
- 🛡️ Super Admin panel quản lý tenants, license, usage

## Kiến trúc

```
┌─ Máy có OpenClaw ────┐   ┌─────────────────────┐
│  (Zalo/Telegram/Lark)│─▶ │  Backend (Fastify)  │
└──────────────────────┘   │  + PostgreSQL       │◀─▶ Dashboard (Next.js)
        (hook forward)     │  + Redis (BullMQ)   │     (iOS-style UI)
                            └─────────────────────┘
                                 (AI + storage)
```

- **OpenClaw** (không phải 1 phần repo này): đăng nhập Zalo/Telegram/Lark, phát event khi có tin nhắn
- **Hook** (`plugin/hooks/zalo-monitor/`): cài lên OpenClaw, forward event về backend
- **Backend**: nhận webhook, AI classify, gửi cảnh báo, API cho dashboard
- **Dashboard**: realtime qua WebSocket, quản lý khách + deal + rules

## Stack

- **Backend**: Node 18+, Fastify, Prisma, PostgreSQL 16, Redis 7, BullMQ, Anthropic SDK
- **Dashboard**: Next.js 15, Tailwind 4, React 19
- **Deploy**: Docker Compose + Caddy (auto HTTPS)
- **AI**: Claude Haiku (có keyword fallback nếu không set API key)

## Cài Zalo Monitor Backend

### Option A — VPS / Máy chủ Linux (khuyến nghị)

**Cách nhanh nhất — dùng script tự động:**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/datlevn09/zalo-monitor/main/scripts/deploy-vps.sh) your-domain.com your@email.com
```

Script sẽ hỏi các config cần thiết rồi tự chạy docker compose.

**Hoặc cài thủ công:**

```bash
git clone https://github.com/datlevn09/zalo-monitor.git
cd zalo-monitor

cp .env.example .env

# Điền các biến BẮT BUỘC trong .env:
# - DOMAIN=your-domain.com
# - POSTGRES_PASSWORD=<sinh bằng: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
# - JWT_SECRET=<sinh bằng command trên>
# - SUPER_ADMIN_TOKEN=<sinh bằng command trên>
# - LETSENCRYPT_EMAIL=admin@your-domain.com (để tự fetch SSL)

docker compose -f docker-compose.prod.yml up -d
```

Caddy sẽ tự fetch SSL cert → dashboard sẽ chạy ở `https://your-domain.com`.

### Option B — Synology NAS (Docker)

1. Mở **Container Manager** (cài từ Package Center nếu chưa có)
2. **Image** → tìm `postgres:16` + `redis:7-alpine`, tải xuống
3. **Compose** → tạo file `docker-compose.yml` (copy từ `docker-compose.prod.yml` và sửa):
   - Xóa Caddy service
   - Để PostgreSQL + Redis bình thường
   - Backend expose port `3001` + Dashboard port `3000`
   - Điền `DOMAIN=<IP-NAS>:3000` hoặc domain riêng nếu có

4. Deploy và truy cập qua `http://<IP-NAS>:3000`

> **Lưu ý**: nếu muốn HTTPS, dùng Cloudflare Tunnel (Option C) hoặc cài reverse proxy phía trước.

### Option C — Cloudflare Tunnel (không cần VPS, không cần port-forward)

Dùng Cloudflare Tunnel để expose backend mà không cần mở port trên router:

```bash
# 1. Cài cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
# 2. Login vào Cloudflare
cloudflared tunnel login

# 3. Tạo tunnel
cloudflared tunnel create zalo-monitor

# 4. Config routing (~/.cloudflared/config.yml)
tunnel: zalo-monitor
credentials-file: /path/to/.cloudflared/<uuid>.json

ingress:
  - hostname: zalo-monitor.example.com
    service: http://localhost:3001
  - service: http_status:404

# 5. Chạy tunnel
cloudflared tunnel run zalo-monitor

# 6. Chạy docker compose dev (bình thường)
docker compose up -d
```

Backend sẽ accessible qua `https://zalo-monitor.example.com` (hoặc subdomain mà bạn chỉ định).

### Option D — Dev local

Để phát triển hoặc test trên máy:

```bash
git clone https://github.com/datlevn09/zalo-monitor.git
cd zalo-monitor

cp .env.example .env
# Điền biến: POSTGRES_PASSWORD, JWT_SECRET, SUPER_ADMIN_TOKEN, DOMAIN=localhost:3000

# 1. Chạy Postgres + Redis qua Docker
docker compose up -d

# 2. Terminal 1 — chạy Backend
cd backend
npm install
npx prisma db push
npm run dev        # http://localhost:3001

# 3. Terminal 2 — chạy Dashboard
cd ../dashboard
npm install
npm run dev        # http://localhost:3000
```

Truy cập:
- Dashboard: http://localhost:3000
- Setup wizard: http://localhost:3000/setup (tạo tenant đầu tiên)
- Super Admin: http://localhost:3000/super-admin (dùng `SUPER_ADMIN_TOKEN`)

## Cài Hook vào OpenClaw (sau khi có backend)

Hook là phần **cầu nối** giữa OpenClaw (nơi chạy Zalo/Telegram/Lark) và Zalo Monitor Backend. Hook sẽ forward mọi tin nhắn từ OpenClaw về backend để AI phân loại + cảnh báo.

> **Chú ý**: Bạn chỉ cần cài hook **1 lần duy nhất** trên máy/server chạy OpenClaw.

### Cách lấy lệnh cài

1. Vào dashboard (http://your-domain.com)
2. **Setup** → **Bước 2: Kết nối OpenClaw**
3. Copy lệnh có dạng:
   ```bash
   curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash
   ```

### Cài trên từng nền tảng

#### Mac / Linux / VPS (OpenClaw chạy native)

Paste lệnh từ dashboard thẳng vào terminal:

```bash
curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash
```

Installer sẽ tự tải hook, ghi config, self-test ping → dashboard tự hiện "✅ Hook đã kết nối".

#### Docker (OpenClaw chạy trong container)

Nếu OpenClaw chạy bằng Docker, dùng `docker exec`:

```bash
docker exec <tên-container-openclaw> bash -c 'BACKEND_URL=https://zalo-monitor.example.com curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash'
```

**Quan trọng**: Nếu chạy OpenClaw trong Docker mà chưa mount volume, hook sẽ **mất khi update**. Thêm volume vào `docker-compose.yml`:

```yaml
services:
  openclaw:
    image: openclaw:latest
    # ... other config ...
    volumes:
      - ./openclaw-config:/home/node/.openclaw  # giữ hook + config qua update
```

> Installer sẽ tự cảnh báo nếu phát hiện đang chạy trong Docker mà chưa có volume mount.

#### Synology NAS

SSH vào NAS rồi chạy:

```bash
docker exec <tên-container-openclaw> bash -c 'BACKEND_URL=https://zalo-monitor.example.com curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash'
```

Hoặc vào **Container Manager → Containers → openclaw → Terminal** → paste lệnh.

#### Windows (Git Bash / WSL)

Mở **Git Bash** (được cài sẵn với Git cho Windows):

```bash
curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash
```

Nếu dùng **WSL**, cần cài curl trước:

```bash
sudo apt update && sudo apt install curl
curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash
```

### Hook có mất khi update OpenClaw không?

| Cách cài OpenClaw | Hook có mất khi update? | Ghi chú |
|---|---|---|
| Native (npm / binary trên máy/VPS) | ✅ **Không mất** | Hook lưu trong `~/.openclaw/` → persist qua update |
| Docker **có** mount volume (`-v ./openclaw-config:/home/node/.openclaw`) | ✅ **Không mất** | Volume mount đảm bảo config không bị xóa |
| Docker **không** mount volume | ⚠️ **Mất khi recreate** | Container reset → hook + config bị xóa |

**Kết luận**: Dù dùng native hay Docker, hãy chắc chắn hook được lưu trữ bền vững. Nếu dùng Docker, **bắt buộc** phải mount volume.

Chi tiết: [plugin/hooks/zalo-monitor/HOOK.md](./plugin/hooks/zalo-monitor/HOOK.md).

## Cấu hình tùy chọn

### AI phân loại

Để bật AI phân loại (tự động phân loại tin nhắn), set `ANTHROPIC_API_KEY` trong `backend/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Nếu không set, hệ thống sẽ dùng **keyword fallback** (free, nhưng chính xác thấp hơn).

### Email (quên mật khẩu, báo cáo)

Set các biến SMTP trong `backend/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@your-domain.com
```

Gmail: dùng [App Password](https://myaccount.google.com/apppasswords). Resend hoặc SendGrid cũng OK.

### Google OAuth

Để bật đăng nhập qua Google, tạo OAuth credentials tại [console.cloud.google.com](https://console.cloud.google.com/apis/credentials):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/callback
```

### Ngành nghề & Keyword tùy chỉnh

Dashboard có preset cho: Real Estate, Retail, Insurance, Education, v.v.

Vào **Settings → Cấu hình AI** để tuỳ chỉnh keyword phân loại cho ngành của bạn.

## Contribute

PR welcome. Xem [CONTRIBUTING.md](./CONTRIBUTING.md).

Issue / feature request: mở issue tại GitHub.

### Roadmap ý tưởng

- Gán khách → nhân viên phụ trách + auto follow-up
- Mẫu tin nhắn nhanh (canned replies)
- SMS OTP login
- Dashboard khách xem license của chính họ
- Webhook secret rotation UI

## Tác giả & hỗ trợ

Build bởi [@dat.thong.dong](https://datthongdong.com) — Lê Đạt

- Web: https://datthongdong.com
- Zalo: 0869999664
- Telegram: [@Datlevn09](https://t.me/Datlevn09)
- Email: datle@outlook.com

## License

MIT — xem [LICENSE](./LICENSE). Dùng free, sửa free, bán kiếm tiền cũng được. Chỉ xin giữ dòng copyright trong source.
