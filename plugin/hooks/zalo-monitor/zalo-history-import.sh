#!/bin/bash
# Đồng bộ dữ liệu cũ (Zalo PC App) — Tự cài Node.js + dependencies + chạy import
#
# Usage:
#   curl -fsSL https://api.../api/setup/hook-files/zalo-history-import.sh | \
#     BACKEND_URL=... WEBHOOK_SECRET=... TENANT_ID=... bash

set -e

if [ -z "$BACKEND_URL" ] || [ -z "$WEBHOOK_SECRET" ] || [ -z "$TENANT_ID" ]; then
  echo "❌ Thiếu env vars: BACKEND_URL, WEBHOOK_SECRET, TENANT_ID"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📦 Đồng bộ dữ liệu cũ Zalo (1-click)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1) Cài Node.js nếu chưa có ──────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "[1/3] Cài Node.js..."
  OS="$(uname -s)"
  case "$OS" in
    Darwin*)
      if command -v brew >/dev/null 2>&1; then
        brew install node && echo "  ✅ Node cài qua Homebrew"
      else
        echo "  ❌ Mac chưa có Homebrew. Cài tại https://brew.sh rồi chạy lại."
        exit 1
      fi
      ;;
    Linux*)
      # Ubuntu/Debian/CentOS — dùng nodesource hoặc nvm
      if command -v apt-get >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null 2>&1
        sudo apt-get install -y nodejs >/dev/null 2>&1 && echo "  ✅ Node cài qua apt"
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y nodejs >/dev/null 2>&1 && echo "  ✅ Node cài qua dnf"
      else
        echo "  ❌ Linux: không phát hiện apt/dnf. Cài Node tay tại https://nodejs.org rồi chạy lại."
        exit 1
      fi
      ;;
    *)
      echo "  ❌ OS không hỗ trợ tự cài: $OS. Cài Node tay tại https://nodejs.org"
      exit 1
      ;;
  esac
else
  echo "[1/3] ✅ Node.js đã có ($(node --version))"
fi

# ── 2) Cài openzca CLI + better-sqlite3 ────────────────
echo "[2/3] Cài openzca + better-sqlite3..."
NPM_GLOBAL="$(npm config get prefix)/bin"
if ! command -v openzca >/dev/null 2>&1 && [ ! -x "$NPM_GLOBAL/openzca" ]; then
  npm install -g openzca better-sqlite3 >/dev/null 2>&1 && echo "  ✅ Đã cài"
else
  # Vẫn cài better-sqlite3 phòng case có openzca mà chưa có sqlite
  npm list -g better-sqlite3 >/dev/null 2>&1 || npm install -g better-sqlite3 >/dev/null 2>&1
  echo "  ✅ openzca có sẵn ($(openzca --version 2>/dev/null || echo 'version unknown'))"
fi

# ── 3) Tải + chạy script import ────────────────────────
echo "[3/3] Tải script + đồng bộ..."
TMP_DIR="$(mktemp -d)"
cd "$TMP_DIR"
curl -fsSL "$BACKEND_URL/api/setup/hook-files/zalo-history-push.mjs" -o zalo-history-push.mjs

# Install better-sqlite3 LOCAL trong tmp dir để Node có thể import được
# (global package không reach được qua ESM import)
npm init -y >/dev/null 2>&1
npm install better-sqlite3 --no-audit --no-fund >/dev/null 2>&1 || \
  echo "  ⚠️  Không cài được better-sqlite3, fallback openzca"

BACKEND_URL="$BACKEND_URL" WEBHOOK_SECRET="$WEBHOOK_SECRET" TENANT_ID="$TENANT_ID" PROFILE="${PROFILE:-}" \
  node zalo-history-push.mjs

cd - >/dev/null
rm -rf "$TMP_DIR"
echo ""
echo "✅ Hoàn tất."
