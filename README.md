# Zalo Monitor

> AI-powered chat monitoring dashboard cho doanh nghiệp Việt. Theo dõi Zalo / Telegram / Lark groups — phân loại bằng AI, cảnh báo real-time, quản lý pipeline bán hàng.

Sản phẩm đóng gói cho reseller: bạn deploy trên VPS, cấp license cho khách, khách cài hook vào OpenClaw của họ → dashboard nhận tin nhắn, phân tích, cảnh báo.

---

## Tính năng

**Dành cho chủ doanh nghiệp (khách hàng):**
- Theo dõi mọi nhóm chat Zalo/Telegram/Lark trong 1 dashboard
- AI tự phân loại: cơ hội / khiếu nại / rủi ro / tích cực
- Cảnh báo real-time khi có vấn đề khẩn cấp
- Pipeline Kanban quản lý deal
- Auto-extract khách hàng (phone, email, avatar) từ tin nhắn
- Báo cáo hàng ngày / tuần / tháng qua Zalo, Telegram, Lark, Email
- Chat với AI để query data bằng ngôn ngữ tự nhiên
- Dark mode + iOS-style UI

**Dành cho reseller (publisher):**
- Super Admin panel quản lý nhiều tenant
- Cấp / gia hạn license key (1/3/6/12 tháng)
- Suspend / activate tenant
- Monitor MRR, usage, tenants sắp hết hạn
- Multi-tenant isolation (mỗi khách 1 webhook secret riêng)

## Kiến trúc

```
┌─ Khách A: OpenClaw ──┐    ┌──────────────────────┐
│  Zalo + Telegram     │───▶│                      │
└──────────────────────┘    │   Backend (Fastify)  │    ┌────────────────┐
                             │   + PostgreSQL       │◀──▶│  Dashboard     │
┌─ Khách B: OpenClaw ──┐    │   + Redis (BullMQ)   │    │  (Next.js)     │
│  Lark + Zalo         │───▶│                      │    └────────────────┘
└──────────────────────┘    └──────────────────────┘
      (hook forward)                (AI + storage)          (khách dùng)
```

- **OpenClaw** (của mỗi khách): đăng nhập Zalo/Telegram/Lark, phát event khi có tin nhắn
- **Hook** (`plugin/hooks/zalo-monitor/`): cài trên OpenClaw khách, forward event về backend
- **Backend**: nhận webhook, lưu DB, enqueue AI classify, gửi cảnh báo
- **Dashboard**: khách xem real-time qua WebSocket, super-admin quản lý tenants

## Stack

- **Backend**: Node 18+, Fastify, Prisma, PostgreSQL 16, Redis 7, BullMQ, Anthropic SDK
- **Dashboard**: Next.js 15, Tailwind 4, React 19
- **Deploy**: Docker Compose + Caddy (auto HTTPS)
- **AI**: Claude Haiku (có keyword fallback nếu không có API key)

## Cài đặt nhanh (dev)

```bash
git clone <repo-url> zalo-monitor
cd zalo-monitor
cp .env.example .env
# Điền các biến bắt buộc: POSTGRES_PASSWORD, JWT_SECRET, SUPER_ADMIN_TOKEN
# Sinh secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

docker compose up -d                 # khởi postgres + redis
cd backend  && npm install && npx prisma db push && npm run dev
cd dashboard && npm install && npm run dev
```

- Dashboard: http://localhost:3000
- Super Admin: http://localhost:3000/super-admin (dùng `SUPER_ADMIN_TOKEN`)
- Backend: http://localhost:3001

## Deploy production

Xem [DEPLOY.md](./DEPLOY.md) — 3 options:
- **A. VPS + Caddy** (tự hosting, auto HTTPS cho khách)
- **B. SaaS centralized** (reseller host tất cả khách trên 1 backend)
- **C. Cloudflare Tunnel** (không cần mở port, đi qua Cloudflare)

## Khách cài hook OpenClaw

Khách vào setup wizard trong dashboard:
1. Điền thông tin doanh nghiệp
2. Copy lệnh install (1 dòng) → paste vào terminal trên máy OpenClaw của họ:
   ```bash
   curl -fsSL "https://your-backend.com/api/setup/inject.sh?tenantId=xxx" | bash
   ```
3. Installer tự tải hook, ghi config, self-test ping — dashboard tự báo "✅ Hook đã kết nối"
4. Cài kênh thông báo (Zalo/Telegram/Lark/Email)

Xem [plugin/hooks/zalo-monitor/HOOK.md](./plugin/hooks/zalo-monitor/HOOK.md) cho chi tiết.

## Cấp license cho khách (reseller)

1. Khách tự đăng ký tenant qua `/setup` → status `trial`
2. Khách thanh toán
3. Bạn vào `/super-admin` → chọn tenant → chọn số tháng → **Gia hạn**
4. Hệ thống tự sinh license key (`ZM-XXXX-XXXX-XXXX`) + set hạn + kích hoạt
5. Hết hạn → tenant tự động bị block (`403 LICENSE_EXPIRED`)

## Contact & hỗ trợ

- Web: https://datthongdong.ai
- Zalo/Tele/Facebook/Email — xem footer dashboard

## License

Proprietary. Xem [LICENSE](./LICENSE). Không được sao chép, tái phân phối, hay làm sản phẩm phái sinh.
