# 批发经营台账（Wholesale Ops）

面向中国大陆小型五金耗材批发商的本地经营演示台账。当前实现包含真实数据库会话、四种固定角色、账号管理和只追加业务审计。演示数据均为虚构，未经真实客户验证；本项目不是财税系统，也不提供在线演示。

## 环境要求

- Node.js 24
- pnpm 11
- Docker Desktop（包含 Docker Compose）

## 本地运行

```bash
corepack enable
pnpm install
pnpm setup
pnpm dev
```

打开 <http://localhost:3000>。`pnpm setup` 会创建未纳入 Git 的 `.env`、生成本地认证密钥、启动 PostgreSQL 18、执行版本化 migration，并写入五个虚构演示账号。

### 演示账号

所有演示账号密码均为 `demo123456`：

| 角色 | 邮箱 |
| --- | --- |
| 老板 | `owner@example.local` |
| 销售 | `sales@example.local` |
| 仓库 | `warehouse@example.local` |
| 财务 | `finance@example.local` |
| 销售、仓库 | `multi@example.local` |

系统没有公开注册、找回密码、邮件验证或第三方登录入口。

老板可以在 `/settings/accounts` 创建账号、分配一个或多个固定角色并停用账号；账号变更与 `/audit` 中的业务审计在同一数据库事务完成。停用会撤销已有会话，并阻止账号再次创建会话。

## 常用检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

停止本地数据库：

```bash
pnpm db:stop
```
