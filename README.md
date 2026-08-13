# 批发经营台账（Wholesale Ops）

面向中国大陆小型五金耗材批发商的本地经营演示台账。当前 ticket 建立正式应用、PostgreSQL、数据库会话和老板登录底座。演示数据均为虚构，未经真实客户验证；本项目不是财税系统，也不提供在线演示。

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

打开 <http://localhost:3000>。`pnpm setup` 会创建未纳入 Git 的 `.env`、生成本地认证密钥、启动 PostgreSQL 18、执行版本化 migration，并写入虚构老板账号。

### 演示老板账号

- 邮箱：`owner@example.local`
- 密码：`demo123456`

系统没有公开注册、找回密码、邮件验证或第三方登录入口。

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
