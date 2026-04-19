# Contributing

Cảm ơn bạn quan tâm. PR và issue đều welcome — tiếng Việt hay tiếng Anh đều OK.

## Report bug / đề xuất tính năng

Mở [issue](https://github.com/<user>/zalo-monitor/issues) với:
- **Bug**: mô tả, bước reproduce, behavior mong muốn vs thực tế, ảnh chụp nếu UI
- **Feature**: vấn đề đang gặp + giải pháp đề xuất (không chỉ tính năng)

## Submit PR

1. Fork repo, tạo branch: `git checkout -b feat/your-feature`
2. Code theo style hiện tại (Tailwind, Prisma, Fastify patterns)
3. Chạy typecheck ở cả backend + dashboard trước khi push:
   ```bash
   cd backend && npx tsc --noEmit
   cd dashboard && npx tsc --noEmit
   ```
4. Commit message rõ ràng (tiếng Việt / Anh đều OK), có prefix: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
5. Open PR, mô tả ngắn gọn: làm gì, tại sao, có ảnh hưởng gì

## Dev setup

Xem [README.md Quickstart](./README.md#quickstart-dev-local).

## Project structure

```
zalo-monitor/
├── backend/          Fastify API, Prisma, BullMQ workers
│   ├── src/routes/   Endpoint handlers
│   ├── src/services/ Business logic (AI, queue, webhook, auth)
│   └── prisma/       DB schema + migrations
├── dashboard/        Next.js 15 app
│   └── src/app/      Pages: /dashboard/*, /super-admin, /setup, /login
├── plugin/hooks/     OpenClaw hook files (HOOK.md, handler.ts)
└── docker-compose*   Local dev + production stacks
```

## Guidelines

- **Không commit `.env`** — đã gitignore nhưng check lại trước khi push
- **Không hardcode secret** trong source code — dùng env vars
- **Tên variable / comment bằng tiếng Việt có dấu cũng OK**, miễn nhất quán
- **UI follow iOS-style** — dùng Tailwind classes có sẵn (card-ios, rounded-2xl, v.v.)
- **Dark mode mandatory** — mọi màu phải có variant `dark:*`

## Liên hệ maintainer

- GitHub issues (khuyến nghị)
- Zalo: 0869999664
- Email: datle@outlook.com
