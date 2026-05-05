# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Next.js app plus a Cloudflare Email Worker. App code lives in `src/`: route handlers are in `src/app/api`, pages in `src/app`, UI components in `src/components`, and domain logic in `src/lib`. Prisma schema and migrations are in `prisma/`. App tests are grouped by feature under `tests/`; Worker code and tests are in `worker/src` and `worker/tests`. Deployment notes are in `docs/`, and static assets are in `public/`.

## Build, Test, and Development Commands

- `npm run dev`: start the local Next.js server using `config/app.config.json`.
- `npm run build`: generate Prisma client and build the app.
- `npm run test` / `npm run test:watch`: run app Vitest tests once or in watch mode.
- `npm run lint`: run Next.js ESLint checks.
- `npm run prisma:migrate`: apply Prisma migrations locally.
- `npm run config:sync-worker`: generate `worker/wrangler.toml` from local config.
- `npm run worker:test`: run Worker tests from the root.
- `npm --prefix worker run typecheck` / `deploy`: type-check or deploy the Worker.

## Coding Style & Naming Conventions

Use TypeScript with `strict` mode. Prefer the `@/` alias for imports from `src`. Keep service logic in focused `src/lib/<domain>` modules and route handlers thin. File names follow the existing kebab-case pattern, such as `message-list.tsx`; exported components use PascalCase, and functions use camelCase. Follow `eslint.config.mjs` and the existing two-space JSON and TypeScript style.

## Testing Guidelines

Vitest is used for both packages. Place app tests under the matching `tests/<feature>/` folder and name them `*.test.ts` or `*.test.tsx`. Component tests use React Testing Library; Worker tests belong in `worker/tests`. Before deployment, run `npm run test`, `npm run worker:test`, `npm --prefix worker run typecheck`, and `npm run build`.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style subjects, for example `feat: add cloudflare email worker`, `test: ignore local worktrees`, and `docs: add deployment guide`. Keep commits focused and use prefixes such as `feat:`, `fix:`, `test:`, `docs:`, or `chore:`. Pull requests should describe the change, note database or Worker configuration impacts, link issues when available, include screenshots for UI changes, and list verification commands.

## Security & Configuration Tips

Create `config/app.config.json` from `config/app.config.example.json` and keep it out of git. Store database credentials, Cloudflare tokens, session secrets, and ingest secrets only in local config or deployment secret stores. After Worker-related config changes, run `npm run config:sync-worker` and update Cloudflare secrets with Wrangler as described in `docs/deployment.md`.
