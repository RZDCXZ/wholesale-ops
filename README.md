# 批发经营台账（Wholesale Ops）

[![CI](https://github.com/RZDCXZ/wholesale-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/RZDCXZ/wholesale-ops/actions/workflows/ci.yml)

这是一个面向中国大陆小型五金耗材批发场景的个人作品集项目。它主要供业务方与技术评审者检查：作者能否把业务规则、角色权限、TypeScript 全栈实现、真实数据库联动、自动化测试和本地交付收敛成一套可复现的软件，而不只是拼装后台页面。

> 所有名称、电话、地址、金额和经营记录均为虚构数据；项目未经真实客户验证，只支持本地运行，没有在线演示，也不是财税系统。经营应收不等于会计凭证、税务发票或法律上的债权证明。

## 首版完成边界

首版只完成“销售单—库存—经营应收”闭环：销售创建并确认销售单，系统原子地预占库存；仓库完成整单出库后扣减现存量并生成一笔应收；财务登记或撤销收款；老板从经营总览和业务审计查看整个过程。

已完成的交付范围包括四种固定角色及服务端数据边界、SKU 和客户资料、期初库存、三类 `.xlsx` 导入、按权限和筛选条件导出、确定性演示数据、数据库备份/恢复，以及领域、PostgreSQL 集成和 Chromium 浏览器测试。完整业务边界见[项目方案](./PROJECT_PLAN.md)，正式术语见[领域词汇表](./CONTEXT.md)。

仓库根目录是正式应用，使用根目录的 `pnpm` 命令运行。`product-ui/` 是前期静态设计原型和视觉验收基线，其中的模拟数据与交互不代表正式业务实现；它保留独立的 npm 工程，仅在维护原型时使用。评审正式能力时，请以根目录应用、数据库 migration 和自动化测试为准，设计依据见[设计 PRD](./DESIGN_PRD.md)。

## 关键业务规则

- **现存量**是仓库实际持有数量，包含已经预留但尚未出库的部分。
- **预占量**是已确认、尚未出库的销售单承诺数量。
- **可用量 = 现存量 − 预占量**；确认时任一 SKU 可用量不足，整张销售单都不会确认，不支持部分预占或并发超卖。
- 销售单履约状态独立维护为**草稿、已确认、已出库、已取消**。草稿可编辑；确认后内容冻结；已确认销售单可在出库前填写原因取消并释放全部预占；首版只支持整单出库。
- 出库在同一事务中同时减少现存量和预占量、写入库存流水、生成经营应收并留下业务审计。首版采用现场交货或自提的简化规则：出库即交付。
- 应收结算状态独立维护为**待收款、部分收款、已结清**。一笔应收可有多笔收款；收款必须大于零且不超过未收金额。超过到期日仍有未收金额时派生为逾期应收。
- 已登记收款不能编辑或删除。财务或老板只能通过填写原因创建撤销记录，保留原收款并恢复未收金额。

## 支持环境

- Node.js `>=24 <25`（项目基线为 Node.js 24 LTS）
- pnpm `>=11 <12`（锁定版本 `11.21.0`）
- Docker Engine 或 Docker Desktop，并支持 Docker Compose
- 最新版 Chrome/Chromium（浏览器验收基线）
- macOS 或 Linux；GitHub Actions 在 Ubuntu 上验证。Windows 原生命令行未纳入首版验证，可使用 WSL2。

正式应用和 PostgreSQL 默认都只监听 `127.0.0.1`。默认端口为应用 `3000`、数据库 `54329`。

## 安装、初始化与启动

```bash
git clone https://github.com/RZDCXZ/wholesale-ops.git
cd wholesale-ops
corepack enable
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

打开 <http://localhost:3000>。`pnpm setup` 会：

1. 从 [`.env.example`](./.env.example) 创建未纳入 Git 的 `.env`，并生成新的本地认证密钥；
2. 启动 PostgreSQL 18；
3. 生成 Prisma Client 并执行全部版本化 migration；
4. 装载完整的虚构演示场景。

重复运行 `pnpm setup` 会先显示警告，再重置本地演示数据库。若只需停止应用，结束 `pnpm dev`；停止数据库使用 `pnpm db:stop`，该命令不会删除 Compose 数据卷。

### 环境变量

| 变量 | 用途 | 本地默认值/要求 |
| --- | --- | --- |
| `DATABASE_URL` | Prisma 和维护脚本连接 PostgreSQL | 指向 `localhost:54329/wholesale_ops` |
| `BETTER_AUTH_URL` | 本地认证基准 URL | `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | 会话签名密钥 | 至少 32 字符；`pnpm setup` 首次运行时随机生成 |
| `LOG_LEVEL` | Pino 本地结构化日志级别 | `info` |

不要把 `.env`、真实密钥、数据库文件、备份、日志或上传文件提交到仓库。`.env.example` 只包含本机示例身份和无效占位密钥。

## 演示账号与权限

所有演示账号密码均为 `demo123456`。`.local` 地址只是本地登录标识，不是真实邮箱，不会发送邮件或连接外部服务。系统没有公开注册、找回密码、邮件验证或第三方登录入口。

| 账号 | 角色 | 可见范围与主要操作 |
| --- | --- | --- |
| `owner@example.local` | 老板 | 查看全部经营数据；管理账号与固定角色、SKU、客户和导入；可处理销售单、出库、应收、收款与业务审计 |
| `sales@example.local` | 销售 | 查看 SKU；只查看和维护自己负责的客户及其销售单、收款进度；创建、确认或取消自己范围内的销售单 |
| `warehouse@example.local` | 仓库 | 只查看待出库任务、必要履约联系方式、库存与流水；完成整单出库；看不到成交价和应收 |
| `finance@example.local` | 财务 | 只读查看全部客户；查看全部应收并登记或撤销收款；不能修改客户、SKU 或库存流水 |
| `multi@example.local` | 销售、仓库 | 合并销售与仓库能力；销售数据仍受客户负责人范围限制 |

老板可在 `/settings/accounts` 创建和停用本地账号，并为一个账号分配一个或多个固定角色。停用账号会撤销其已有会话。

## 可重复的完整演示路径

演示场景包含 5 个账号、30 个 SKU、8 个客户和 20 张历史销售单；日期相对重置当天的中国标准时间生成。以下路径每次都从相同数据开始：

1. 运行 `pnpm demo:reset -- --yes`，再保持 `pnpm dev` 运行。
2. 以销售账号登录，新建销售单：选择客户 `KH-0003`（广顺五金商行），添加 `WJ-LS-001` 数量 `1` 和 `WJ-QP-004` 数量 `2`，保存草稿后确认。详情页会显示两项库存预占。
3. 退出后以仓库账号登录，在“待出库”找到刚才的销售单，核对联系人和数量并完成整单出库。仓库页面不显示价格；库存的现存量和预占量会同时减少。
4. 退出后以财务账号登录，在“应收”按销售单编号或客户名找到新应收，登记 `20.00` 元银行转账。结算状态变为“部分收款”，未收金额相应减少。
5. 退出后以老板账号登录，在“经营总览”核对今日销售额、今日收款额和未收金额，再到“业务审计”按销售单编号查看确认、出库和收款记录。
6. 再次运行 `pnpm demo:reset -- --yes` 即可清除这次操作并恢复固定场景。

重置命令会销毁目标中的全部本地演示数据。它只接受本机地址、固定的 `wholesale_ops` 数据库身份与已完成 migration 的项目 schema，但执行前仍应核对终端显示的目标。

## 备份与恢复

备份使用 PostgreSQL 18 的 `pg_dump` 自定义格式，默认写入未纳入 Git 的 `backups/`：

```bash
pnpm db:backup
pnpm db:backup -- --output backups/before-demo.dump
```

恢复会覆盖目标数据库。确认命令显示的目标和文件无误后执行：

```bash
pnpm db:restore -- --input backups/before-demo.dump --yes
```

备份和恢复只接受经过校验的本机演示数据库。`pg_dump` 与 `pg_restore` 由官方 PostgreSQL Docker 镜像运行，主机无需另装 PostgreSQL 客户端。

## 检查、测试与生产构建

初始化数据库后，依次运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
pnpm build
pnpm start
```

- `pnpm test` 运行领域单元测试和使用临时 PostgreSQL 容器的集成测试，需要 Docker 正在运行。
- `pnpm test:e2e` 运行 Chromium 浏览器测试，使用当前 `.env` 指向的本地演示数据库。
- `pnpm build` 生成 standalone 生产包并复制静态资源，`pnpm start` 用该生产包在 <http://localhost:3000> 启动；运行 `pnpm start` 前不要同时运行开发服务器。
- [GitHub Actions](https://github.com/RZDCXZ/wholesale-ops/actions/workflows/ci.yml) 在每次 push 和 pull request 上展示并执行依赖安装、migration、代码检查、类型检查、单元/集成测试、生产构建和独立 Chromium 测试。

## 已知限制与后续路线图

首版不支持退货、退款、出库冲销、采购、供应商、收货入库、应付、盘点、库存调整、补货、多仓库、分批出库、预收款、跨应收分摊、成本/毛利/利润、发票或税务申报。尤其是已出库错误目前不能在系统内纠正，演示时只能通过重置数据恢复。

项目也不包含线上部署、在线演示、多租户、公开注册、真实支付、云备份、云日志或真实经营数据导入；当前安全边界只面向受控的本地演示环境，不能直接作为生产系统使用。

后续路线图按独立阶段处理：

1. 优先设计退货验收入库、应收调整和必要退款，补齐反向业务流程；
2. 增加供应商、采购、收货入库、应付与付款；
3. 增加盘点、库存调整、补货、多仓库和调拨；
4. 经过真实客户研究、安全加固和运维设计后，再评估线上部署。

## License

代码以 [MIT License](./LICENSE) 开源。仓库中的虚构演示数据仅用于展示项目能力。
