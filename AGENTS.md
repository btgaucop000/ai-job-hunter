# Coding-agent instructions

## Workflow

- Develop in Ubuntu WSL2 with Cursor, Bash, Node 24.22.1, and pnpm 12.14.0.
- Keep the repository in `/home/tientb/projects/ai-job-hunter`. Do not change Windows tools or reinstall existing tools.
- Implement only the approved checkpoint. Stop after each checkpoint, report changed files, commands and actual results, explain important decisions and tradeoffs, and wait for approval.
- Preserve unrelated changes. Do not commit or push without explicit approval.

## Architecture

- Use pnpm workspaces: `apps/web` (React, Vite, MUI, React Router) and `apps/api` (NestJS modular monolith).
- Keep backend entities and business rules inside their owning modules. Collaborate through exported services; avoid generic repository wrappers and speculative abstractions.
- Defer `packages/shared` until both applications need meaningful shared contracts. Never share ORM entities with the browser.
- REST routes use `/api/v1`. Keep liveness separate from database readiness.
- PostgreSQL runs in Docker. TypeORM uses explicit reversible migrations, `synchronize: false`, and `migrationsRun: false`.
- No authentication, AI integrations, crawlers, workers, microservices, or additional infrastructure in Task 01.
- Add dependencies only for a concrete requirement and explain their purpose.

## Security and privacy

- Never commit secrets, personal resumes, credentials, or production data. Use placeholders in example configuration and synthetic test fixtures.
- Keep credentials and server configuration out of frontend bundles. Never log sensitive payloads or connection strings.
- Validate external input and required configuration at boundaries. Do not expose internal errors in API responses.
- Keep development and test databases isolated. Refuse integration tests against development or production targets.
- Do not delete persistent data or run destructive operations without explicit authorization.

## Quality and communication

- Use strict TypeScript, explicit module boundaries, and readable code.
- Run formatting, lint, type checks, and builds for scaffold/configuration changes. Add meaningful Jest, Vitest, and PostgreSQL integration tests as behavior is introduced.
- Verify migrations in TypeScript development and compiled JavaScript execution, including apply, revert, reapply, and repeat-run behavior.
- Never report unexecuted checks as passing. Report blockers and remaining risks precisely.
- Explain significant technical choices and alternatives in `docs/architecture.md`; keep README commands accurate for the implemented checkpoint.
