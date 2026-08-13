# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable design decisions

- Use the selected “方案一 / 账本网格” visual direction as the source of truth: light sidebar, pale gray page background, white work surfaces, blue primary actions, compact bordered tables, restrained shadows, and explicit text-plus-color status labels.
- Keep desktop `1440 × 1024` as the primary design target and `390 × 844` as the mobile checkpoint.
- Preserve the formal Chinese domain vocabulary from the repository PRD and keep fulfillment status separate from receivable settlement status.
