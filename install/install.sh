#!/bin/bash
set -e

echo "🚀 Zalo Monitor - Self-hosted Installation"
echo "==========================================="
echo ""

# Check Docker installed
if ! command -v docker &> /dev/null; then
  echo "⚠️  Docker không được cài đặt. Đang cài đặt..."
  curl -fsSL https://get.docker.com | sh
  echo "✅ Docker đã được cài đặt"
fi

# Check Docker Compose installed
if ! command -v docker compose &> /dev/null; then
  echo "⚠️  Docker Compose không được cài đặt"
  exit 1
fi

echo "✅ Docker đã cài đặt"
echo "✅ Docker Compose đã cài đặt"
echo ""

# Create installation directory
INSTALL_DIR="$HOME/zalo-monitor"
if [ -d "$INSTALL_DIR" ]; then
  echo "📁 Thư mục $INSTALL_DIR đã tồn tại"
else
  echo "📁 Tạo thư mục $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
echo "📂 Đang làm việc trong: $(pwd)"
echo ""

# Download docker-compose.yml
echo "📥 Đang tải docker-compose.yml..."
if ! curl -fSL -o docker-compose.yml "https://api.datthongdong.com/install/docker-compose.yml"; then
  echo "❌ Không thể tải docker-compose.yml"
  exit 1
fi
echo "✅ docker-compose.yml đã được tải"

# Download .env.example
echo "📥 Đang tải .env.example..."
if ! curl -fSL -o .env.example "https://api.datthongdong.com/install/.env.example"; then
  echo "❌ Không thể tải .env.example"
  exit 1
fi
echo "✅ .env.example đã được tải"

# Copy to .env if not exists
if [ ! -f ".env" ]; then
  echo "⚙️  Tạo file .env từ .env.example..."
  cp .env.example .env
  echo "✅ File .env đã được tạo"
else
  echo "ℹ️  File .env đã tồn tại (không ghi đè)"
fi

echo ""
echo "=========================================="
echo "✅ Zalo Monitor đã được cài đặt vào $INSTALL_DIR"
echo "=========================================="
echo ""
echo "Bước tiếp theo:"
echo "1. cd $INSTALL_DIR"
echo "2. nano .env        ← điền DOMAIN và LICENSE_KEY"
echo "3. docker compose up -d"
echo ""
echo "📖 Hướng dẫn chi tiết: https://zalo.datthongdong.com/docs"
echo ""
