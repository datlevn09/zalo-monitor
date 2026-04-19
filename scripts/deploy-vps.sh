#!/bin/bash
# Zalo Monitor — VPS auto-deploy script
# Chạy trên VPS Ubuntu 22.04/24.04 mới:
#   curl -fsSL https://raw.githubusercontent.com/<your-user>/zalo-monitor/main/scripts/deploy-vps.sh | bash -s DOMAIN EMAIL
# Hoặc clone repo trước rồi: bash scripts/deploy-vps.sh zalo.example.com you@example.com

set -euo pipefail

DOMAIN="${1:-${DOMAIN:-}}"
EMAIL="${2:-${LETSENCRYPT_EMAIL:-}}"
REPO_URL="${REPO_URL:-https://github.com/ledatvn/zalo-monitor.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/zalo-monitor}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  cat <<EOF
Usage: deploy-vps.sh <DOMAIN> <EMAIL>

Arguments:
  DOMAIN — domain trỏ về VPS này (VD: zalo.example.com)
           DNS A record phải trỏ sẵn về IP VPS này trước khi chạy.
  EMAIL  — email cho Let's Encrypt SSL cert

Ví dụ:
  bash deploy-vps.sh zalo.datthongdong.com admin@datthongdong.com
EOF
  exit 1
fi

echo "══════════════════════════════════════════════════════════════"
echo "  Zalo Monitor — VPS Deploy"
echo "  Domain: $DOMAIN"
echo "  Email:  $EMAIL"
echo "  Dir:    $INSTALL_DIR"
echo "══════════════════════════════════════════════════════════════"

# ── 1. Install Docker nếu chưa có ──────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# ── 2. Clone repo hoặc pull ─────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "🔄 Pulling latest from $INSTALL_DIR"
  cd "$INSTALL_DIR" && git pull
else
  echo "📥 Cloning $REPO_URL → $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ── 3. Setup .env nếu chưa có ──────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "📝 Creating .env from .env.example"
  cp .env.example .env
fi

# Generate secrets nếu đang placeholder / empty
gen_hex() { openssl rand -hex "$1"; }

set_env() {
  local KEY="$1"; local VAL="$2"
  if grep -q "^${KEY}=" .env; then
    # Chỉ set nếu empty hoặc placeholder
    local CUR
    CUR=$(grep "^${KEY}=" .env | head -1 | cut -d= -f2- | tr -d '"' | xargs)
    if [ -z "$CUR" ] || [[ "$CUR" == change-this* ]] || [[ "$CUR" == changeme ]]; then
      sed -i.bak "s|^${KEY}=.*|${KEY}=${VAL}|" .env
      echo "  ✓ ${KEY} = $(echo "$VAL" | cut -c1-10)..."
    fi
  else
    echo "${KEY}=${VAL}" >> .env
    echo "  ✓ ${KEY} (added)"
  fi
}

echo "🔐 Configuring secrets..."
set_env DOMAIN "$DOMAIN"
set_env LETSENCRYPT_EMAIL "$EMAIL"
set_env PUBLIC_BACKEND_URL "https://${DOMAIN}"
set_env DASHBOARD_URL "https://${DOMAIN}"
set_env NEXT_PUBLIC_API_URL "https://${DOMAIN}"
set_env NEXT_PUBLIC_WS_URL "wss://${DOMAIN}"
set_env POSTGRES_PASSWORD "$(gen_hex 16)"
set_env JWT_SECRET "$(gen_hex 32)"
set_env WEBHOOK_SECRET "$(gen_hex 32)"
SUPER_TOKEN="$(gen_hex 32)"
set_env SUPER_ADMIN_TOKEN "$SUPER_TOKEN"

# ── 4. Start Docker stack ──────────────────────────────────────────────────
echo "🚢 Starting Docker stack..."
docker compose -f docker-compose.prod.yml up -d --build

# ── 5. DB migrate ──────────────────────────────────────────────────────────
echo "⏳ Đợi Postgres ready..."
sleep 5
docker compose -f docker-compose.prod.yml exec -T backend npx prisma db push --skip-generate || true

# ── 6. Final instructions ─────────────────────────────────────────────────
cat <<EOF

══════════════════════════════════════════════════════════════
✅ Zalo Monitor đã deploy xong!

📍 URL dashboard:    https://${DOMAIN}
📍 Super admin:      https://${DOMAIN}/super-admin

🛡️  SUPER_ADMIN_TOKEN (LƯU NGAY vào password manager):

    ${SUPER_TOKEN}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bước tiếp (optional, làm trên server):

1. SMTP (cho forgot-password email):
   - Nếu dùng Gmail: vào https://myaccount.google.com/apppasswords tạo app password
   - Edit ${INSTALL_DIR}/.env, điền SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM
   - Restart: docker compose -f docker-compose.prod.yml restart backend

2. Google OAuth (login với Google):
   - https://console.cloud.google.com/apis/credentials → OAuth Client
   - Authorized redirect: https://${DOMAIN}/api/auth/google/callback
   - Edit .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
   - Restart backend

3. AI classify (optional, tăng độ chính xác):
   - https://console.anthropic.com → lấy API key
   - Edit .env: ANTHROPIC_API_KEY
   - Restart backend

4. Check logs: docker compose -f docker-compose.prod.yml logs -f backend
5. Caddy SSL cert: tự fetch Let's Encrypt trong 30-60s sau khi DNS đã propagate.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
