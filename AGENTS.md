# 仓库 Agent 约定

## Issue 与 spec

处理 `.scratch/` 下的 issue 或 spec 时，先读 [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md)。

## Triage

给 issue 做 triage，或将 skill 中的 triage 角色映射到仓库标签时，先读 [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md)。

## 领域文档

探索代码库、命名领域概念或判断 ADR 冲突时，先读 [`docs/agents/domain.md`](./docs/agents/domain.md)。

## 正式前端

开发或修改正式前端页面时，先读 [`docs/agents/production-ui.md`](./docs/agents/production-ui.md)。该文档规定设计原型的使用边界、生产实现约束和页面变更的完成检查。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
