---
name: zalo-monitor
description: "Forward message events to Zalo Monitor backend for AI classification and alerts"
metadata:
  {
    "openclaw":
      {
        "emoji": "📊",
        "events":
          ["message:received", "message:preprocessed", "message:sent"],
      },
  }
---

# Zalo Monitor Hook

Forward toàn bộ message events từ OpenClaw (Zalo, Telegram, Lark/Feishu) tới Zalo Monitor backend để:

- Lưu trữ tập trung theo doanh nghiệp (multi-tenant)
- Phân loại bằng AI: cơ hội / khiếu nại / rủi ro / trung tính
- Cảnh báo real-time qua Zalo/Telegram/Lark/Email
- Báo cáo hàng ngày cho quản lý

Hook **read-only** — KHÔNG reply vào nhóm khách, chỉ đọc và forward.

## Cài đặt nhanh

Vào dashboard → **Setup → Bước 2: Kết nối OpenClaw** → copy lệnh → paste vào terminal máy cài OpenClaw.

Lệnh có dạng:

```bash
curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash
```

Installer sẽ tự:
1. Tải `HOOK.md` + `handler.ts` về `~/.openclaw/hooks/zalo-monitor/`
2. Ghi config `.env` (mode 600) với secret + tenantId của bạn
3. Enable hook qua `openclaw hooks enable zalo-monitor` (nếu có CLI)
4. Self-test ping backend → dashboard tự hiện "✅ Hook đã kết nối"

### Cài trên từng nền tảng

#### Mac / Linux / VPS (OpenClaw chạy native)

Paste lệnh từ dashboard thẳng vào terminal:

```bash
curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash
```

#### Docker (OpenClaw chạy trong container)

Dùng `docker exec`:

```bash
docker exec <openclaw-container> bash -c 'BACKEND_URL=https://zalo-monitor.example.com curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash'
```

**Chú ý quan trọng**: Nếu OpenClaw chạy trong Docker mà chưa mount volume, hook sẽ **mất khi update container**. Thêm dòng này vào `docker-compose.yml`:

```yaml
services:
  openclaw:
    image: openclaw:latest
    volumes:
      - ./openclaw-config:/home/node/.openclaw  # giữ hook + config qua update
```

#### Synology NAS

SSH vào NAS hoặc mở **Container Manager → Containers → openclaw → Terminal**, rồi paste lệnh:

```bash
BACKEND_URL=https://zalo-monitor.example.com curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash
```

#### Windows (Git Bash / WSL)

**Git Bash:**

```bash
curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash
```

**WSL (Windows Subsystem for Linux):**

```bash
sudo apt update && sudo apt install curl
curl -fsSL "https://zalo-monitor.example.com/api/setup/inject.sh?tenantId=xxx" | bash
```

## Config file

Hook config lưu tại `~/.openclaw/hooks/zalo-monitor/.env` (mode 600 — read-only):

```
BACKEND_URL=https://zalo-monitor.example.com
WEBHOOK_SECRET=<per-tenant-secret>
TENANT_ID=<tenant-id>
```

**Bảo mật**: Secret là **per-tenant** (mỗi doanh nghiệp có 1 secret riêng). Leak secret chỉ ảnh hưởng 1 tenant, có thể regenerate trong super-admin.

## Event flow

| Event | Nội dung |
|---|---|
| `message:received` | Tin nhắn thô (có thể chứa `<media:...>` tags) |
| `message:preprocessed` | Body đã enrich: transcript audio, OCR ảnh, tóm tắt |
| `message:sent` | Bot reply (để tính response time) |

Handler gọi backend **non-blocking** — nếu backend down, OpenClaw vẫn chạy bình thường.

## Troubleshooting

### Hook không fire

1. Check hook có enabled không:
   ```bash
   openclaw hooks list
   ```
   Nếu không có dấu ✅ cạnh `zalo-monitor`, enable:
   ```bash
   openclaw hooks enable zalo-monitor
   ```

2. Tìm error log:
   ```bash
   tail -f ~/.openclaw/logs/zalo-monitor.log
   ```

### Dashboard không nhận tin nhắn

Test kết nối backend:

```bash
curl -X POST "https://zalo-monitor.example.com/api/setup/hook-test" \
  -H "X-Tenant-Id: <tenant-id>" \
  -H "X-Webhook-Secret: <secret>"
```

- **Trả `{"ok":true}`**: Kết nối OK, vấn đề là hook không forward. Check hook log ở trên.
- **Trả `401 Unauthorized`**: Secret sai, chạy lại install command từ dashboard.
- **Trả `403 "suspended"`**: Tenant bị tạm ngưng, liên hệ publisher.
- **Timeout / không kết nối**: Firewall hoặc URL backend sai. Check DNS + port.

### Tin nhắn bị drop

Backend chỉ lưu tin từ các channel được bật. Vào dashboard **Settings → Kênh theo dõi** → bật ZALO / TELEGRAM / LARK tuỳ ý.

### Webhook secret bị leak

Liên hệ super-admin để regenerate secret (chưa có UI tự động). Hoặc update trực tiếp DB:

```sql
UPDATE webhook_secrets SET secret = '<new-secret>' WHERE tenant_id = '<tenant-id>';
```

## Runtime requirement

Handler dùng Node.js built-in modules: `fs`, `path`, `os`, `fetch`. Yêu cầu **Node 18+** (cho native fetch API). OpenClaw phải load được TypeScript hoặc compile sang `.js`.
