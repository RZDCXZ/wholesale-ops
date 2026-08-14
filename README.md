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

打开 <http://localhost:3000>。`pnpm setup` 会创建未纳入 Git 的 `.env`、生成本地认证密钥、启动 PostgreSQL 18、执行全部版本化 migration，并装载完整的虚构演示场景。重复运行会先警告并重置本地演示数据库。

### 演示账号

所有演示账号密码均为 `demo123456`。下列 `.local` 地址只是本地登录标识，不是真实邮箱，不会发送邮件或连接任何外部服务：

| 角色 | 邮箱 |
| --- | --- |
| 老板 | `owner@example.local` |
| 销售 | `sales@example.local` |
| 仓库 | `warehouse@example.local` |
| 财务 | `finance@example.local` |
| 销售、仓库 | `multi@example.local` |

系统没有公开注册、找回密码、邮件验证或第三方登录入口。

演示场景包含 30 个 SKU、8 个客户、20 张销售单及相对重置当天（中国标准时间）生成的出库、应收和收款记录。需要恢复初始场景时，先确认 `.env` 指向本仓库 Compose 创建的本机数据库，再运行：

```bash
pnpm demo:reset -- --yes
```

该命令会销毁目标中的全部本地演示数据。它只接受本机地址、固定的 `wholesale_ops` 数据库身份与已完成 migration 的项目 schema。

## 本地备份与恢复

备份使用 PostgreSQL 18 的 `pg_dump` 自定义格式，默认写入未纳入 Git 的 `backups/`：

```bash
pnpm db:backup
pnpm db:backup -- --output backups/before-demo.dump
```

恢复会覆盖目标数据库。确认命令显示的目标和文件无误后执行：

```bash
pnpm db:restore -- --input backups/before-demo.dump --yes
```

`pg_dump` 与 `pg_restore` 从官方 PostgreSQL Docker 镜像运行，因此不要求主机另外安装 PostgreSQL 客户端。

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
