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

---

## Cài đặt nhanh

Vào dashboard → **Setup → Bước 2 Kết nối OpenClaw** → copy lệnh → paste vào terminal máy cài OpenClaw. Lệnh có dạng:

```bash
curl -fsSL "https://<backend>/api/setup/inject.sh?tenantId=<your-id>" | bash
```

Installer sẽ:
1. Tải `HOOK.md` + `handler.ts` về `~/.openclaw/hooks/zalo-monitor/`
2. Ghi config `.env` (mode 600) với secret + tenantId của bạn
3. Enable hook qua `openclaw hooks enable zalo-monitor` (nếu có CLI)
4. **Self-test ping** backend để xác nhận kết nối — dashboard tự hiện "✅ Hook đã kết nối"

---

## Config `~/.openclaw/hooks/zalo-monitor/.env`

```
BACKEND_URL=https://your-backend.example.com
WEBHOOK_SECRET=<per-tenant-secret>
TENANT_ID=<tenant-id>
```

**Secret là per-tenant** — mỗi doanh nghiệp có 1 secret riêng, không dùng chung. Leak secret chỉ ảnh hưởng 1 tenant, có thể đổi bằng super-admin.

---

## Event flow

| Event | Nội dung |
|---|---|
| `message:received` | Tin nhắn thô (có thể chứa `<media:...>`) |
| `message:preprocessed` | Body đã enrich: transcript audio, OCR ảnh |
| `message:sent` | Bot reply (để tính response time) |

Handler gọi backend **non-blocking** — backend down thì OpenClaw vẫn chạy bình thường.

---

## Troubleshooting

**Hook không fire:**
- `openclaw hooks list` — có `zalo-monitor` với dấu ✅?
- Không có? Chạy `openclaw hooks enable zalo-monitor`
- Vẫn không? Check `~/.openclaw/logs/` tìm error từ handler

**Dashboard không nhận tin:**
- `curl -X POST "$BACKEND_URL/api/setup/hook-test" -H "X-Tenant-Id: $TENANT_ID" -H "X-Webhook-Secret: $SECRET"` — nếu trả `{"ok":true}` là kết nối OK, vấn đề là hook không forward
- Nếu `401` → secret sai, chạy lại install command từ dashboard
- Nếu `403 "suspended"` → tenant bị tạm ngưng, liên hệ publisher
- Nếu timeout/không kết nối → firewall hoặc URL backend sai

**Tin nhắn bị drop:**
- Backend chỉ lưu channel trong `enabledChannels` của tenant. Check **Settings → Kênh theo dõi** trong dashboard, bật ZALO/TELEGRAM/LARK nếu cần.

**Secret bị leak:**
- Super-admin → tenant → **Cấp key mới** (regenerate license key). Để regenerate webhook secret, hiện chưa có UI — update trực tiếp DB hoặc contact publisher.

---

## Runtime requirement

Handler dùng `fs`, `path`, `os`, `fetch` từ Node.js built-in. Yêu cầu **Node 18+** (cho fetch native). OpenClaw phải load được TypeScript file hoặc compile sẵn sang `.js`.
