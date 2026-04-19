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

## Quickstart (dev local)

Yêu cầu: Docker, Node 18+.

```bash
git clone https://github.com/<your-user>/zalo-monitor.git
cd zalo-monitor

# 1. Setup env
cp .env.example .env
# Điền các biến BẮT BUỘC: POSTGRES_PASSWORD, JWT_SECRET, SUPER_ADMIN_TOKEN
# Sinh secret nhanh: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Chạy postgres + redis qua Docker
docker compose up -d

# 3. Chạy backend
cd backend
npm install
npx prisma db push
npm run dev      # http://localhost:3001

# 4. Chạy dashboard (terminal khác)
cd ../dashboard
npm install
npm run dev      # http://localhost:3000
```

Truy cập:
- Dashboard: http://localhost:3000
- Setup wizard: http://localhost:3000/setup (tạo tenant đầu tiên)
- Super Admin: http://localhost:3000/super-admin (dùng `SUPER_ADMIN_TOKEN`)

## Deploy production

Xem [DEPLOY.md](./DEPLOY.md) — 3 options (VPS + Caddy, SaaS, Cloudflare Tunnel).

Tóm tắt nhanh:
```bash
cp .env.example .env
# Điền DOMAIN, POSTGRES_PASSWORD, JWT_SECRET, SUPER_ADMIN_TOKEN, LETSENCRYPT_EMAIL
docker compose -f docker-compose.prod.yml up -d
```
Caddy tự fetch SSL cert → HTTPS ngay.

## Cài hook vào OpenClaw của bạn

Hook = phần forward tin nhắn từ OpenClaw → backend. Sau khi dashboard chạy xong:

1. Vào setup wizard → tạo tenant
2. Copy lệnh install (tự sinh URL backend + secret), paste vào terminal máy chạy OpenClaw:
   ```bash
   curl -fsSL "https://<your-backend>/api/setup/inject.sh?tenantId=xxx" | bash
   ```
3. Installer tự tải hook, ghi config, self-test ping → dashboard hiện "✅ Hook đã kết nối"

Chi tiết: [plugin/hooks/zalo-monitor/HOOK.md](./plugin/hooks/zalo-monitor/HOOK.md).

## Cấu hình tùy chọn

- **AI classify**: set `ANTHROPIC_API_KEY` trong `backend/.env`. Không set → dùng keyword fallback (free).
- **Email (forgot-password)**: set `SMTP_*` trong backend/.env. Gmail App Password hoặc Resend đều OK.
- **Google OAuth**: set `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`. Đăng ký tại [console.cloud.google.com](https://console.cloud.google.com/apis/credentials).
- **Ngành nghề**: dashboard có preset cho real estate, retail, insurance, v.v. — tự chỉnh keyword trong tab Cấu hình AI.

## Contribute

PR welcome. Xem [CONTRIBUTING.md](./CONTRIBUTING.md).

Issue / feature request: mở issue tại GitHub.

Roadmap ý tưởng:
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
