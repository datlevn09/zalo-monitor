FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY backend/package.json backend/package-lock.json ./
RUN npm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY plugin/ /app/plugin/

EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -5 && node dist/server.js"]

# Note: Installation files (docker-compose.customer.yml, .env.customer.example, install/install.sh)
# are mounted as volumes in docker-compose.customer.yml, not copied here
