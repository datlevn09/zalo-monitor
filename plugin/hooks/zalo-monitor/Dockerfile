# Zalo Monitor Listener — chạy trên mọi platform có Docker
# Build:  docker build -t zalo-monitor-listener .
# Run:    docker run -d --name zalo-listener \
#           -v zalo-data:/home/node/.openzca \
#           -e BACKEND_URL=https://... \
#           -e WEBHOOK_SECRET=xxx \
#           -e TENANT_ID=xxx \
#           --restart unless-stopped \
#           zalo-monitor-listener
#
# Login Zalo lần đầu (interactive QR scan):
#   docker exec -it zalo-listener openzca --profile zalo-monitor auth login
#
# Profile 'zalo-monitor' tách biệt với 'default' (nếu khách dùng OpenClaw)
# → KHÔNG xung đột session, có thể chạy song song.

FROM node:22-alpine

RUN npm install -g openzca

WORKDIR /app
COPY zalo-listener.mjs /app/zalo-listener.mjs

# Volume cho openzca session (~/.openzca)
USER node
ENV HOME=/home/node
RUN mkdir -p /home/node/.openzca

CMD ["node", "/app/zalo-listener.mjs"]
