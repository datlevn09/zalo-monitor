# Deploy Guide — Zalo Monitor cho khách hàng

## 3 cách deploy

| Option | Khó | Phù hợp khi |
|---|---|---|
| A. VPS + Caddy (self-hosted) | Medium | Khách có nhiều tài liệu bảo mật, muốn full control |
| B. SaaS (anh host chung) | Easy cho khách | Nhiều khách, muốn scale |
| C. Cloudflare Tunnel | Easy | Demo nhanh, không cần VPS |

---

## Option A — Deploy lên VPS của khách

**Yêu cầu:** 1 domain + 1 VPS ≥ 2GB RAM

### Bước 1: Chuẩn bị VPS
```bash
# SSH vào VPS
ssh root@vps-ip

# Install Docker
curl -fsSL https://get.docker.com | sh
```

### Bước 2: Point domain → VPS
Tạo **A record** trong DNS provider:
```
dashboard.khach-ten.com  A  <vps-ip>
```

### Bước 3: Deploy
```bash
git clone <repo-url> zalo-monitor
cd zalo-monitor

cat > .env <<EOF
DOMAIN=dashboard.khach-ten.com
POSTGRES_PASSWORD=$(openssl rand -hex 16)
WEBHOOK_SECRET=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...
ADMIN_NAME=Your Support Name
ADMIN_TELEGRAM=your_tg_handle
ADMIN_ZALO=0900000000
ADMIN_EMAIL=support@example.com
SUPER_ADMIN_TOKEN=$(openssl rand -hex 32)
EOF

docker compose -f docker-compose.prod.yml up -d
```

Caddy auto-fetch Let's Encrypt cert → HTTPS bật ngay. Khách truy cập:
```
https://dashboard.khach-ten.com
```

---

## Option B — SaaS centralized (anh host)

Deploy 1 lần trên server lớn, nhiều khách dùng chung.

- Multi-tenant đã sẵn (`tenant_id` phân biệt data mỗi khách)
- Mỗi khách có URL riêng: `https://zalo-monitor.com/t/khach-a`
- OpenClaw của khách trỏ webhook về `https://zalo-monitor.com/webhook/message`

**Tradeoff:** Khách phải enable public webhook từ OpenClaw → cần CF Tunnel hoặc port forward phía họ.

---

## Option C — Cloudflare Tunnel (demo nhanh)

Không cần VPS, chạy trên máy khách, có HTTPS ngay.

### Cài
```bash
# Trên máy khách (Mac/Linux)
brew install cloudflared   # hoặc download binary
cloudflared tunnel login
cloudflared tunnel create zalo-monitor
```

### Config `~/.cloudflared/config.yml`
```yaml
tunnel: <tunnel-id>
credentials-file: ~/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: dashboard.khach.com
    service: http://localhost:3000
  - hostname: api.khach.com
    service: http://localhost:3001
  - service: http_status:404
```

### Route DNS
```bash
cloudflared tunnel route dns zalo-monitor dashboard.khach.com
cloudflared tunnel route dns zalo-monitor api.khach.com
```

### Start
```bash
cloudflared tunnel run zalo-monitor
```

Khách truy cập `https://dashboard.khach.com` từ bất cứ đâu.

---

## Notes

- **OpenClaw** vẫn chạy local trên máy khách (connect Zalo)
- **Backend + dashboard** có thể chạy cùng máy OpenClaw HOẶC tách VPS
- Nếu tách VPS: cần VPS có thể access OpenClaw qua LAN hoặc VPN (Tailscale free)
- **HTTPS bắt buộc** cho Zalo mobile webhook (Telegram/Lark cũng yêu cầu)
