#!/bin/bash
# Start openzca standalone listener forwarding to Zalo Monitor backend.
# Không qua openzalo plugin — đọc-only, không spam.
#
# Usage: được gọi từ backend khi tenant enable Zalo channel.

set -e

TENANT_ID="${TENANT_ID:?TENANT_ID required}"
BACKEND_URL="${BACKEND_URL:-http://host.docker.internal:3001}"
SECRET="${WEBHOOK_SECRET:?WEBHOOK_SECRET required}"
PROFILE="${ZALO_PROFILE:-default}"

WEBHOOK="$BACKEND_URL/webhook/zalo"

echo "📡 Starting openzca listener for tenant=$TENANT_ID"
echo "   Forward → $WEBHOOK"

# -H không support trực tiếp; dùng ENV cho openzca nếu support, hoặc wrap qua curl
# openzca listen --webhook chỉ gửi POST thường. Ta phải wrap request qua proxy.
# Solution: dùng --webhook cho 1 nội dung proxy local, rồi proxy forward với header.
#
# Simpler: openzca listen --raw | while read line; do curl -X POST ... ; done

exec openzca --profile "$PROFILE" listen --raw --keep-alive | \
  while IFS= read -r line; do
    # Bỏ qua lifecycle events
    if echo "$line" | grep -q '"type":"lifecycle"'; then continue; fi
    # Forward
    curl -sf -X POST "$WEBHOOK" \
      -H "Content-Type: application/json" \
      -H "X-Webhook-Secret: $SECRET" \
      -H "X-Tenant-Id: $TENANT_ID" \
      -d "$line" &
  done
