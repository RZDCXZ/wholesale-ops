import { useMemo, useState } from "react";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBell,
  IconBox,
  IconBuildingWarehouse,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconDownload,
  IconDots,
  IconFileInvoice,
  IconFileSpreadsheet,
  IconFilter,
  IconHistory,
  IconHome,
  IconLock,
  IconMenu2,
  IconPackageExport,
  IconPlus,
  IconReceipt2,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconShoppingCart,
  IconTrash,
  IconUpload,
  IconUser,
  IconUsers,
  IconWallet,
  IconX,
} from "@tabler/icons-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const navGroups = [
  { label: "经营", items: [{ key: "overview", label: "经营总览", icon: IconChartBar }] },
  {
    label: "销售",
    items: [
      { key: "sales", label: "销售单", icon: IconFileInvoice },
      { key: "customers", label: "客户", icon: IconUsers },
      { key: "skus", label: "SKU", icon: IconBox },
    ],
  },
  {
    label: "仓库",
    items: [
      { key: "outbound", label: "待出库", icon: IconPackageExport },
      { key: "inventory", label: "库存", icon: IconBuildingWarehouse },
    ],
  },
  { label: "财务", items: [{ key: "receivables", label: "应收", icon: IconReceipt2 }] },
  {
    label: "数据",
    items: [
      { key: "imports", label: "导入", icon: IconUpload },
      { key: "audit", label: "业务审计", icon: IconShieldCheck },
    ],
  },
  { label: "设置", items: [{ key: "accounts", label: "账号与角色", icon: IconUser }] },
];

const roleAccess = {
  owner: ["overview", "sales", "customers", "skus", "outbound", "inventory", "receivables", "imports", "audit", "accounts"],
  sales: ["sales", "customers", "skus", "inventory"],
  warehouse: ["outbound", "inventory"],
  finance: ["customers", "receivables"],
};

const profiles = {
  owner: { name: "张伟", role: "老板", home: "overview" },
  sales: { name: "陈敏", role: "销售", home: "sales" },
  warehouse: { name: "王强", role: "仓库", home: "outbound" },
  finance: { name: "刘芳", role: "财务", home: "receivables" },
};

const skuRows = [
  ["WJ-LS-001", "304 不锈钢六角螺栓 M8×30", "紧固件", "盒", "¥48.50", "120", "40", "80", "20", "启用"],
  ["WJ-QP-004", "树脂切割片 105mm", "切割耗材", "片", "¥3.80", "60", "10", "50", "15", "启用"],
  ["WJ-ZT-008", "高速钢直柄麻花钻 8mm", "钻削工具", "支", "¥18.90", "22", "12", "10", "12", "库存预警"],
  ["WJ-SJ-011", "加长套筒 12mm", "手动工具", "个", "¥26.00", "18", "8", "10", "10", "库存预警"],
  ["WJ-JD-016", "角磨机碳刷 6×10mm", "电动工具配件", "对", "¥9.50", "40", "3", "37", "8", "启用"],
];

const customerRows = [
  ["KH-0003", "广顺五金商行", "李海峰", "138 0000 0000", "陈敏", "30 天", "¥684.00", "启用"],
  ["KH-0001", "华南机电工程部", "周志成", "136 0000 0000", "陈敏", "15 天", "¥2,360.00", "启用"],
  ["KH-0005", "鑫达维修服务中心", "何建国", "135 0000 0000", "赵磊", "现结", "¥0.00", "启用"],
  ["KH-0007", "宏远装饰工程", "林嘉怡", "139 0000 0000", "赵磊", "30 天", "¥8,120.00", "启用"],
];

const salesRows = [
  ["XSD-20260813-0007", "广顺五金商行", "2026-08-13", "陈敏", "2", "¥1,084.00", "已确认", "2026-08-13 09:26"],
  ["XSD-20260813-0006", "华南机电工程部", "2026-08-13", "陈敏", "3", "¥2,360.00", "已出库", "2026-08-13 09:02"],
  ["XSD-20260812-0018", "宏远装饰工程", "2026-08-12", "赵磊", "4", "¥8,120.00", "已出库", "2026-08-12 16:48"],
  ["XSD-20260812-0017", "鑫达维修服务中心", "2026-08-12", "赵磊", "1", "¥756.00", "草稿", "2026-08-13 08:41"],
  ["XSD-20260811-0012", "广顺五金商行", "2026-08-11", "陈敏", "2", "¥1,260.00", "已取消", "2026-08-11 17:23"],
];

const inventoryRows = skuRows.map((r, i) => [r[0], r[1], r[3], r[5], r[6], r[7], r[8], Number(r[7]) <= Number(r[8]) ? "库存预警" : "正常", `2026-08-${13 - i} ${10 + i}:20`]);

const receivableRows = [
  ["YS-20260813-0006", "华南机电工程部", "XSD-20260813-0006", "¥2,360.00", "¥0.00", "¥2,360.00", "2026-08-28", "待收款", "—"],
  ["YS-20260812-0018", "宏远装饰工程", "XSD-20260812-0018", "¥8,120.00", "¥3,000.00", "¥5,120.00", "2026-08-11", "部分收款", "逾期 2 天"],
  ["YS-20260808-0009", "广顺五金商行", "XSD-20260808-0009", "¥1,084.00", "¥400.00", "¥684.00", "2026-09-07", "部分收款", "—"],
  ["YS-20260805-0004", "鑫达维修服务中心", "XSD-20260805-0004", "¥756.00", "¥756.00", "¥0.00", "2026-08-05", "已结清", "—"],
];

const trendData = [
  { day: "07-15", value: 1200 }, { day: "07-19", value: 800 }, { day: "07-23", value: 2600 },
  { day: "07-27", value: 1450 }, { day: "07-31", value: 3200 }, { day: "08-04", value: 2100 },
  { day: "08-08", value: 3900 }, { day: "08-13", value: 1840 },
];

const statusTone = (value) => {
  if (["已确认", "已结清", "启用", "正常", "成功"].includes(value)) return "success";
  if (["库存预警", "部分收款", "逾期 2 天", "待收款"].includes(value)) return "warning";
  if (["已取消", "停用", "错误"].includes(value)) return "danger";
  if (["草稿", "待处理"].includes(value)) return "neutral";
  return "info";
};

function Status({ children, tone }) {
  return <span className={`status ${tone || statusTone(children)}`}>{children}</span>;
}

function Button({ children, variant = "secondary", icon: Icon, onClick, disabled, type = "button" }) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`button ${variant}`}>{Icon && <Icon size={17} stroke={1.9} />}{children}</button>;
}

function Modal({ title, children, action, actionLabel, onClose, danger = false }) {
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><IconX size={20} /></button></div>
      <div className="modal-body">{children}</div>
      <div className="modal-foot"><Button onClick={onClose}>返回</Button><Button variant={danger ? "danger" : "primary"} onClick={action}>{actionLabel}</Button></div>
    </section>
  </div>;
}

function Drawer({ title, children, onClose, footer }) {
  return <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><IconX size={20} /></button></div>
      <div className="drawer-body">{children}</div><div className="drawer-foot">{footer}</div>
    </aside>
  </div>;
}

function Field({ label, children, hint, required }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function PageHeader({ eyebrow, title, status, description, children, back, metaInline = false }) {
  return <header className="page-header">
    <div>{eyebrow && <div className="eyebrow">{back && <IconArrowLeft size={16} />}{eyebrow}</div>}<div className="title-line"><h1>{title}</h1>{status && <Status>{status}</Status>}{metaInline && description && <p className="inline-meta">{description}</p>}</div>{!metaInline && description && <p>{description}</p>}</div>
    {children && <div className="page-actions">{children}</div>}
  </header>;
}

function FilterBar({ search, setSearch, children, exportLabel }) {
  return <div className="filter-bar">
    <label className="search"><IconSearch size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索编码或名称" /></label>
    {children}<Button icon={IconFilter}>更多筛选</Button>
    {exportLabel && <Button icon={IconDownload}>{exportLabel}</Button>}
  </div>;
}

function DataTable({ columns, rows, onRow, statusColumns = [] }) {
  return <div className="table-wrap"><table><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>
    {rows.map((row, i) => <tr key={row[0] + i} onClick={() => onRow?.(row)} className={onRow ? "clickable" : ""}>{row.map((cell, j) => <td key={j} data-label={columns[j]} className={j === 0 ? "code" : ""}>{statusColumns.includes(j) && cell !== "—" ? <Status>{cell}</Status> : cell}</td>)}</tr>)}
  </tbody></table></div>;
}

function EmptyState({ filtered, onClear, createLabel, onCreate }) {
  return <div className="empty"><div className="empty-icon"><IconSearch size={24} /></div><h3>{filtered ? "当前筛选无结果" : "系统暂无数据"}</h3><p>{filtered ? "请调整关键词或清除筛选条件后重试。" : "业务记录将在这里集中展示并保持可追溯。"}</p>{filtered ? <Button onClick={onClear}>清除筛选</Button> : createLabel && <Button variant="primary" onClick={onCreate}>{createLabel}</Button>}</div>;
}

function AppShell({ page, setPage, role, setRole, children, mobileNav, setMobileNav }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const access = roleAccess[role];
  const active = page.startsWith("sales") ? "sales" : page.startsWith("sku") ? "skus" : page.startsWith("customer") ? "customers" : page.startsWith("receivable") ? "receivables" : page === "ledger" ? "inventory" : page;
  const navigate = (key) => { setPage(key); setMobileNav(false); };
  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="关闭导航" />}
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <div className="brand"><div><strong>批发经营台账</strong><span>Wholesale Ops</span></div><button className="icon-button desktop-only" aria-label="折叠导航"><IconMenu2 size={22} /></button></div>
      <nav>{navGroups.map((group) => {
        const items = group.items.filter((item) => access.includes(item.key));
        if (!items.length) return null;
        return <div className="nav-group" key={group.label}><span>{group.label}</span>{items.map((item) => <button key={item.key} className={active === item.key ? "active" : ""} onClick={() => navigate(item.key)}><item.icon size={20} stroke={1.8} />{item.label}</button>)}</div>;
      })}</nav>
      <div className="demo-note">本地演示 · 数据均为虚构</div>
    </aside>
    <div className="shell-main">
      <div className="topbar"><button className="icon-button mobile-only" aria-label="打开导航" onClick={() => setMobileNav(true)}><IconMenu2 /></button><div className="crumb">{navGroups.flatMap(g => g.items).find(i => i.key === active)?.label || "经营总览"}<IconChevronRight size={14} /><span>{page === "sales-detail" ? "XSD-20260813-0007" : page.includes("detail") ? "详情" : "工作台"}</span></div><div className="top-actions"><button className="icon-button" aria-label="通知"><IconBell size={20} /></button><div className="account-wrap"><button className="account" onClick={() => setAccountOpen(!accountOpen)}><span className="avatar">{profiles[role].name.slice(0, 1)}</span><strong>{profiles[role].name}</strong><Status tone="info">{profiles[role].role}</Status>{role === "owner" && <Status tone="success">财务</Status>}<IconChevronDown size={16} /></button>{accountOpen && <div className="account-menu"><strong>切换演示账号</strong>{Object.entries(profiles).map(([key, p]) => <button key={key} onClick={() => { setRole(key); setPage(p.home); setAccountOpen(false); }}><span>{p.name}</span><Status>{p.role}</Status></button>)}<button onClick={() => { setPage("login"); setAccountOpen(false); }}><span>退出登录</span></button></div>}</div></div></div>
      <main className="content">{children}</main>
    </div>
  </div>;
}

function Login({ onLogin }) {
  const [error, setError] = useState(false);
  return <main className="login-page"><section className="login-brand"><div className="brand-mark"><IconShoppingCart size={28} /></div><h1>批发经营台账</h1><p>Wholesale Ops</p><div className="login-copy"><h2>把销售、库存与应收连成一条可信记录</h2><p>用于中国大陆五金耗材批发业务的本地经营演示台账。</p></div><small>本地演示环境 · 数据均为虚构 · 不是财税系统</small></section><section className="login-panel"><form onSubmit={(e) => { e.preventDefault(); if (error) setError(false); onLogin(); }}><div><span className="kicker">欢迎回来</span><h2>登录工作区</h2><p>使用预置演示账号进入与角色相符的首页。</p></div>{error && <div className="alert danger"><IconAlertCircle size={18} />邮箱或密码不正确，请检查后重试。</div>}<Field label="邮箱" required><input defaultValue="owner@example.local" type="email" /></Field><Field label="密码" required><input defaultValue="demo123456" type="password" /></Field><Button variant="primary" type="submit">登录</Button><button type="button" className="text-button" onClick={() => setError(true)}>查看登录失败状态</button><div className="demo-accounts"><strong>演示账号</strong><span>老板 · 销售 · 仓库 · 财务 · 多角色账号</span></div></form></section></main>;
}

function Overview({ setPage }) {
  const metrics = [["今日销售额", "¥12,684.00", "7 张已出库销售单"], ["今日收款额", "¥8,240.00", "6 笔有效收款"], ["未收金额", "¥36,724.00", "12 笔未结清应收"], ["逾期金额", "¥8,120.00", "2 笔逾期应收"]];
  return <><PageHeader title="经营总览" description="2026-08-13 · 今日按中国标准时间统计"><Button icon={IconRefresh}>刷新数据</Button></PageHeader><div className="metric-grid">{metrics.map((m, i) => <button key={m[0]} className={`metric ${i === 3 ? "risk" : ""}`} onClick={() => setPage(i < 2 ? "sales" : "receivables")}><span>{m[0]}<IconChevronRight size={15} /></span><strong>{m[1]}</strong><small>{m[2]}</small></button>)}</div><div className="overview-grid"><section className="panel chart-panel"><div className="section-head"><div><h2>最近 30 天收款趋势</h2><p>按收款日期汇总有效收款金额</p></div><Status tone="neutral">人民币</Status></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData}><CartesianGrid vertical={false} stroke="#E4E7EC" /><XAxis dataKey="day" tick={{ fontSize: 12, fill: "#667085" }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(v) => `${v / 1000}k`} tick={{ fontSize: 12, fill: "#667085" }} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => [`¥${Number(v).toLocaleString()}.00`, "收款金额"]} /><Line type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} /></LineChart></ResponsiveContainer></div></section><section className="panel warning-panel"><div className="section-head"><div><h2>库存预警</h2><p>可用量小于或等于预警值</p></div><button className="big-link" onClick={() => setPage("inventory")}>5 个 SKU<IconChevronRight size={18} /></button></div><DataTable columns={["SKU", "名称", "可用量", "预警值"]} rows={inventoryRows.slice(2, 5).map(r => [r[0], r[1], r[5], r[6]])} /></section></div></>;
}

function ListPage({ type, setPage }) {
  const [search, setSearch] = useState("");
  const config = {
    skus: { title: "SKU", desc: "查找 SKU 并比较库存状态", create: "新建 SKU", columns: ["SKU 编码", "名称", "分类", "单位", "参考售价", "现存量", "预占量", "可用量", "预警值", "状态"], rows: skuRows, status: [9], target: "sku-detail" },
    customers: { title: "客户", desc: "按负责人和状态查找客户", create: "新建客户", columns: ["客户编码", "客户名称", "联系人", "电话", "客户负责人", "默认账期", "未收金额", "状态"], rows: customerRows, status: [7], target: "customer-detail" },
    sales: { title: "销售单", desc: "判断当前履约状态和下一步动作", create: "新建销售单", columns: ["销售单编号", "客户", "创建日期", "客户负责人", "明细数", "成交金额", "履约状态", "更新时间"], rows: salesRows, status: [6], target: "sales-detail" },
    inventory: { title: "库存", desc: "默认仓库 · 可用量 = 现存量 - 预占量", create: null, columns: ["SKU 编码", "名称", "单位", "现存量", "预占量", "可用量", "预警值", "库存状态", "最近变化"], rows: inventoryRows, status: [7], target: "sku-detail" },
    receivables: { title: "应收", desc: "识别待收款、部分收款、已结清和逾期应收", create: null, columns: ["应收编号", "客户", "销售单编号", "原始金额", "累计收款", "未收金额", "到期日", "结算状态", "逾期状态"], rows: receivableRows, status: [7, 8], target: "receivable-detail" },
  }[type];
  const rows = useMemo(() => config.rows.filter((r) => r.some((cell) => String(cell).toLowerCase().includes(search.toLowerCase()))), [config.rows, search]);
  const createTarget = type === "sales" ? "sales-new" : type === "skus" ? "sku-new" : "customer-new";
  return <><PageHeader title={config.title} description={config.desc}>{config.create && <Button variant="primary" icon={IconPlus} onClick={() => setPage(createTarget)}>{config.create}</Button>}</PageHeader><section className="panel list-panel"><FilterBar search={search} setSearch={setSearch} exportLabel={["sales", "receivables"].includes(type) ? "导出当前结果" : undefined}><select aria-label="状态筛选"><option>全部状态</option><option>启用</option><option>库存预警</option></select></FilterBar>{rows.length ? <><DataTable columns={config.columns} rows={rows} statusColumns={config.status} onRow={() => setPage(config.target)} /><div className="pagination"><span>共 {rows.length} 条 · 每页 20 条</span><div><Button disabled>上一页</Button><span className="page-number">1</span><Button disabled>下一页</Button></div></div></> : <EmptyState filtered onClear={() => setSearch("")} />}</section>{type === "inventory" && <div className="helper-bar"><IconHistory size={18} /><span>数量不可直接编辑，所有变化均通过库存流水追溯。</span><Button onClick={() => setPage("ledger")}>查看库存流水</Button></div>}</>;
}

function EntityForm({ type, setPage, isNew = false }) {
  const isSku = type === "sku";
  const title = isSku ? (isNew ? "新建 SKU" : "WJ-LS-001") : (isNew ? "新建客户" : "KH-0003 · 广顺五金商行");
  const back = isSku ? "skus" : "customers";
  if (!isNew) return <><PageHeader eyebrow={isSku ? "SKU / WJ-LS-001" : "客户 / KH-0003"} title={title} status="启用"><Button onClick={() => setPage(back)}>返回列表</Button><Button variant="primary">编辑资料</Button></PageHeader><section className="panel detail-panel"><div className="section-head"><div><h2>基本资料</h2><p>{isSku ? "SKU 编码创建后不可修改" : "客户编码创建后不可修改"}</p></div></div><dl className="detail-grid">{(isSku ? [["SKU 编码", "WJ-LS-001"], ["名称", "304 不锈钢六角螺栓 M8×30"], ["分类", "紧固件"], ["库存单位", "盒"], ["参考售价", "¥48.50"], ["预警值", "20"]] : [["客户编码", "KH-0003"], ["客户名称", "广顺五金商行"], ["联系人", "李海峰"], ["电话", "138 0000 0000"], ["客户负责人", "陈敏"], ["默认账期", "30 天"], ["地址", "广东省深圳市宝安区工业路 18 号"]]).map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>{isSku ? <><div className="stat-strip"><div><span>现存量</span><strong>120 盒</strong></div><div><span>预占量</span><strong>40 盒</strong></div><div><span>可用量</span><strong>80 盒</strong></div><div><span>库存状态</span><Status>正常</Status></div></div><section className="panel"><div className="section-head"><h2>最近库存流水</h2><Button onClick={() => setPage("ledger")}>查看完整流水</Button></div><DataTable columns={["发生时间", "类型", "现存量变化", "预占量变化", "关联编号", "操作者"]} rows={[["2026-08-13 09:26", "建立预占", "0", "+20", "XSD-20260813-0007", "陈敏"], ["2026-08-12 16:48", "出库", "-12", "-12", "XSD-20260812-0018", "王强"]]} /></section></> : <><div className="stat-strip"><div><span>销售单数量</span><strong>8</strong></div><div><span>最近交易</span><strong>2026-08-13</strong></div><div><span>未收金额</span><strong>¥684.00</strong></div><div><span>逾期金额</span><strong>¥0.00</strong></div></div><section className="panel"><div className="section-head"><h2>相关销售单</h2><Button onClick={() => setPage("sales")}>查看全部</Button></div><DataTable columns={["销售单编号", "创建日期", "成交金额", "履约状态"]} rows={salesRows.filter(r => r[1] === "广顺五金商行").map(r => [r[0], r[2], r[5], r[6]])} statusColumns={[3]} /></section></>}</>;
  return <><PageHeader eyebrow={isSku ? "SKU / 新建" : "客户 / 新建"} title={title} description="带 * 的字段为必填项"><Button onClick={() => setPage(back)}>取消</Button><Button variant="primary" onClick={() => setPage(isSku ? "sku-detail" : "customer-detail")}>保存{isSku ? " SKU" : "客户"}</Button></PageHeader><section className="panel form-panel"><h2>基本资料</h2><div className="form-grid">{isSku ? <><Field label="SKU 编码" required hint="创建后不可修改"><input placeholder="例如 WJ-LS-018" /></Field><Field label="名称" required><input placeholder="输入完整名称与规格" /></Field><Field label="分类" required><select><option>紧固件</option><option>切割耗材</option></select></Field><Field label="库存单位" required><select><option>盒</option><option>片</option><option>个</option></select></Field><Field label="参考售价" required><input placeholder="¥0.00" /></Field><Field label="预警值" required><input type="number" defaultValue="0" /></Field></> : <><Field label="客户编码" required hint="创建后不可修改"><input placeholder="例如 KH-0009" /></Field><Field label="客户名称" required><input placeholder="输入客户名称" /></Field><Field label="联系人" required><input placeholder="输入联系人" /></Field><Field label="电话" required><input placeholder="输入手机或座机" /></Field><Field label="客户负责人" required><select><option>陈敏</option><option>赵磊</option></select></Field><Field label="默认账期" required><select><option>现结</option><option>15 天</option><option>30 天</option></select></Field><Field label="地址" required><textarea placeholder="输入完整履约地址" /></Field></>}</div></section></>;
}

function CancelledSalesDetail({ setPage }) {
  return <><PageHeader title="XSD-20260813-0007" status="已取消" description="客户：广顺五金商行　 创建时间：2026-08-13 09:18" metaInline><Button onClick={() => setPage("sales")}>返回销售单列表</Button></PageHeader><div className="alert danger"><IconCircleCheck size={19} /><span>已取消并释放全部库存预占 · 2026-08-13 10:05</span><button onClick={() => setPage("audit")}>查看取消审计</button></div><div className="fact-strip"><div><span>客户编码</span><strong>KH-0003</strong></div><div><span>客户负责人</span><strong>陈敏</strong></div><div><span>账期</span><strong>30 天</strong></div><div><span>成交总额</span><strong>¥1,084.00</strong></div><div className="frozen"><IconLock size={19} /><span><strong>已取消并永久保留</strong><small>不能重新启用或修改</small></span></div></div><div className="detail-layout"><div className="detail-main"><section className="panel flush"><div className="section-head"><h2>销售明细（共 2 行）</h2></div><DataTable columns={["#", "SKU", "商品名称", "单位", "数量", "成交价（元）", "小计（元）"]} rows={[["1", "WJ-LS-001", "304 不锈钢六角螺栓 M8×30", "盒", "20", "48.50", "970.00"], ["2", "WJ-QP-004", "树脂切割片 105mm", "片", "30", "3.80", "114.00"], ["", "", "", "", "", "合计（含税）", "¥1,084.00"]]} /></section><section className="panel flush"><div className="section-head"><h2>库存影响（释放预占）</h2><span className="formula">现存量不变，可用量相应恢复</span></div><DataTable columns={["SKU", "商品名称", "现存量变化", "预占量变化", "可用量变化"]} rows={[["WJ-LS-001", "304 不锈钢六角螺栓 M8×30", "120　不变", "60 → 40　-20", "60 → 80　+20"], ["WJ-QP-004", "树脂切割片 105mm", "60　不变", "40 → 10　-30", "20 → 50　+30"]]} /></section><p className="foot-hint"><IconLock size={16} />销售单已取消并永久保留，不能重新启用、编辑、删除或再次取消。</p></div><aside className="detail-aside"><section className="panel"><h2>履约记录</h2><div className="timeline"><div className="done"><i><IconCheck size={15} /></i><strong>创建销售单</strong><span>2026-08-13 09:18　陈敏</span></div><div className="done"><i></i><strong>确认并预占库存</strong><span>2026-08-13 09:26　陈敏</span></div><div className="done cancelled-step"><i><IconX size={15} /></i><strong>取消并释放全部预占</strong><span>2026-08-13 10:05　陈敏</span><small>原因：客户项目延期，停止本次采购</small></div></div></section><section className="panel"><h2>客户快照</h2><strong>李海峰</strong><p>138 0000 0000</p><p>广东省深圳市宝安区工业路 18 号</p></section></aside></div></>;
}

function CancelSalesOrderPreview() {
  return <><div className="alert danger"><IconAlertCircle size={19} /><div><strong>将释放全部库存预占</strong><span>现存量保持不变，可用量相应恢复；销售单取消后永久保留。</span></div></div><div className="section-head"><div><h3>将释放的 SKU 与预占数量</h3><p>提交时会重新校验销售单当前状态。</p></div></div><DataTable columns={["SKU", "商品名称", "释放数量"]} rows={[["WJ-LS-001", "304 不锈钢六角螺栓 M8×30", "20 盒"], ["WJ-QP-004", "树脂切割片 105mm", "30 片"]]} /><Field label="取消原因" required><textarea defaultValue="客户项目延期，停止本次采购" placeholder="请说明取消原因" /></Field></>;
}

function SalesDetail({ setPage, stage, setStage, setModal }) {
  if (stage === "cancelled") return <CancelledSalesDetail setPage={setPage} />;
  const confirmed = stage === "confirmed";
  return <><PageHeader title="XSD-20260813-0007" status={confirmed ? "已确认" : "已出库"} description="客户：广顺五金商行　 创建时间：2026-08-13 09:18" metaInline>{confirmed ? <><Button variant="primary" onClick={() => setModal("outbound")}>完成整单出库</Button><Button onClick={() => setModal("cancel")}>取消销售单</Button><button className="icon-button bordered" aria-label="更多操作"><IconDots size={20} /></button></> : <Button variant="primary" onClick={() => setPage("receivable-detail")}>查看关联应收</Button>}</PageHeader><div className={`alert ${confirmed ? "success" : "info"}`}><IconCircleCheck size={19} /><span>{confirmed ? "已确认并预占库存 · 2026-08-13 09:26" : "已完成整单出库 · 2026-08-13 10:12"}</span><button onClick={() => setPage("audit")}>查看业务审计</button></div><div className="fact-strip"><div><span>客户编码</span><strong>KH-0003</strong></div><div><span>客户负责人</span><strong>陈敏</strong></div><div><span>账期</span><strong>30 天</strong></div><div><span>成交总额</span><strong>¥1,084.00</strong></div><div className="frozen"><IconLock size={19} /><span><strong>已确认内容已冻结</strong><small>不可修改</small></span></div></div><div className="detail-layout"><div className="detail-main"><section className="panel flush"><div className="section-head"><h2>销售明细（共 2 行）</h2></div><DataTable columns={["#", "SKU", "商品名称", "单位", "数量", "成交价（元）", "小计（元）"]} rows={[["1", "WJ-LS-001", "304 不锈钢六角螺栓 M8×30", "盒", "20", "48.50", "970.00"], ["2", "WJ-QP-004", "树脂切割片 105mm", "片", "30", "3.80", "114.00"], ["", "", "", "", "", "合计（含税）", "¥1,084.00"]]} /></section><section className="panel flush"><div className="section-head"><h2>库存影响（{confirmed ? "预占库存" : "完成出库"}）</h2><span className="formula">可用量 = 现存量 - 预占量</span></div><DataTable columns={["SKU", "商品名称", "现存量变化", "预占量变化", "可用量变化"]} rows={confirmed ? [["WJ-LS-001", "304 不锈钢六角螺栓 M8×30", "120　不变", "40 → 60　+20", "80 → 60　-20"], ["WJ-QP-004", "树脂切割片 105mm", "60　不变", "10 → 40　+30", "50 → 20　-30"]] : [["WJ-LS-001", "304 不锈钢六角螺栓 M8×30", "120 → 100　-20", "60 → 40　-20", "60　不变"], ["WJ-QP-004", "树脂切割片 105mm", "60 → 30　-30", "40 → 10　-30", "20　不变"]]} /></section><p className="foot-hint"><IconLock size={16} />已确认内容被冻结，仅支持通过业务动作继续流转。</p></div><aside className="detail-aside"><section className="panel"><h2>履约记录</h2><div className="timeline"><div className="done"><i><IconCheck size={15} /></i><strong>创建销售单</strong><span>2026-08-13 09:18　陈敏</span></div><div className="done"><i></i><strong>确认并预占库存</strong><span>2026-08-13 09:26　陈敏</span></div><div className={confirmed ? "next" : "done"}><i>{!confirmed && <IconCheck size={15} />}</i><strong>{confirmed ? "等待完整出库" : "完成整单出库"}</strong><span>{confirmed ? "下一步" : "2026-08-13 10:12　王强"}</span></div></div></section><section className="panel"><h2>客户快照</h2><strong>李海峰</strong><p>138 0000 0000</p><p>广东省深圳市宝安区工业路 18 号</p></section></aside></div></>;
}

function SalesDraft({ setPage, setModal, shortage, setShortage }) {
  return <><PageHeader eyebrow="销售单 / 新建" title="新建销售单" description="草稿可随时保存，确认后内容与账期快照将冻结"><Button onClick={() => setPage("sales")}>返回列表</Button></PageHeader>{shortage && <div className="alert danger"><IconAlertCircle size={19} /><div><strong>销售单未确认</strong><span>WJ-QP-004 需要 70 片，当前可用量 50 片，缺少 20 片。请修改数量后再次确认。</span></div></div>}<section className="panel form-panel"><h2>1. 客户与账期</h2><div className="form-grid"><Field label="客户" required><select><option>KH-0003 · 广顺五金商行</option></select></Field><Field label="客户负责人"><input value="陈敏" readOnly /></Field><Field label="账期快照"><input value="30 天" readOnly /></Field><Field label="履约地址"><input value="广东省深圳市宝安区工业路 18 号" readOnly /></Field></div></section><section className="panel order-editor"><div className="section-head"><div><h2>2. 销售明细</h2><p>参考售价仅用于默认值，成交价可以调整</p></div><Button icon={IconPlus}>添加明细</Button></div><div className="editor-row"><select><option>WJ-LS-001 · 304 不锈钢六角螺栓 M8×30</option></select><span className="stock-ok">可用量 80 盒</span><input aria-label="数量" defaultValue="20" /><input aria-label="成交价" defaultValue="48.50" /><strong>¥970.00</strong><button className="icon-button"><IconTrash size={18} /></button></div><div className={`editor-row ${shortage ? "row-error" : ""}`}><select><option>WJ-QP-004 · 树脂切割片 105mm</option></select><span className={shortage ? "stock-bad" : "stock-ok"}>可用量 50 片</span><input aria-label="数量" defaultValue={shortage ? "70" : "30"} /><input aria-label="成交价" defaultValue="3.80" /><strong>{shortage ? "¥266.00" : "¥114.00"}</strong><button className="icon-button"><IconTrash size={18} /></button></div><div className="order-total"><span>明细 2 行</span><span>成交总额 <strong>{shortage ? "¥1,236.00" : "¥1,084.00"}</strong></span></div></section><div className="sticky-actions"><Button>保存草稿</Button><button className="text-button" onClick={() => setShortage(!shortage)}>{shortage ? "恢复正常数量" : "查看库存不足状态"}</button><Button variant="primary" onClick={() => shortage ? setShortage(true) : setModal("confirm")}>确认销售单</Button></div></>;
}

function Outbound({ setModal }) {
  return <><PageHeader title="待出库工作台" description="默认仓库 · 仅显示履约所需信息"><Status tone="info">2 张待处理</Status></PageHeader><div className="privacy-note"><IconShieldCheck size={19} /><span>仓库视图不展示成交价、销售单金额、应收或收款信息。</span></div><section className="panel list-panel"><FilterBar search="" setSearch={() => {}}><select><option>全部确认日期</option></select></FilterBar><DataTable columns={["销售单编号", "客户名称", "联系人", "电话", "地址摘要", "确认时间", "明细数", "操作"]} rows={[["XSD-20260813-0007", "广顺五金商行", "李海峰", "138 0000 0000", "深圳市宝安区工业路 18 号", "2026-08-13 09:26", "2", "查看并出库"], ["XSD-20260813-0002", "华南机电工程部", "周志成", "136 0000 0000", "深圳市龙华区民治大道 27 号", "2026-08-13 08:15", "3", "查看并出库"]]} onRow={() => setModal("outbound")} /></section></>;
}

function Ledger() {
  const [search, setSearch] = useState("");
  return <><PageHeader title="库存流水" description="只追加、只读 · 所有数量变化均可追溯"><Button icon={IconDownload}>导出当前结果</Button></PageHeader><section className="panel list-panel"><FilterBar search={search} setSearch={setSearch}><select><option>全部流水类型</option><option>建立预占</option><option>释放预占</option><option>出库</option></select></FilterBar><DataTable columns={["发生时间", "SKU", "类型", "现存量变化", "预占量变化", "变化后现存量", "变化后预占量", "变化后可用量", "关联对象", "操作者"]} rows={[["2026-08-13 10:12", "WJ-LS-001", "出库", "-20", "-20", "100", "40", "60", "XSD-20260813-0007", "王强"], ["2026-08-13 09:26", "WJ-LS-001", "建立预占", "0", "+20", "120", "60", "60", "XSD-20260813-0007", "陈敏"], ["2026-08-13 09:26", "WJ-QP-004", "建立预占", "0", "+30", "60", "40", "20", "XSD-20260813-0007", "陈敏"], ["2026-08-12 17:23", "WJ-LS-001", "释放预占", "0", "-12", "120", "40", "80", "XSD-20260811-0012", "陈敏"]]} /></section></>;
}

function ReceivableDetail({ paid, setPaid, reversed, setModal, setDrawer, setPage }) {
  const remaining = paid ? 684 : 1084;
  return <><PageHeader eyebrow="应收 / YS-20260813-0007" title="YS-20260813-0007" status={remaining === 0 ? "已结清" : paid ? "部分收款" : "待收款"} description="广顺五金商行 · 来源销售单 XSD-20260813-0007">{remaining > 0 && <Button variant="primary" onClick={() => setDrawer("payment")}>登记收款</Button>}</PageHeader><div className="amount-grid"><div><span>原始金额</span><strong>¥1,084.00</strong></div><div><span>有效累计收款</span><strong>¥{paid ? "400.00" : "0.00"}</strong></div><div className="emphasis"><span>未收金额</span><strong>¥{remaining.toLocaleString()}.00</strong></div></div><div className="receivable-layout"><section className="panel"><div className="section-head"><h2>到期信息</h2>{remaining > 0 && <Status tone="neutral">未逾期</Status>}</div><dl className="detail-grid compact"><div><dt>出库日</dt><dd>2026-08-13</dd></div><div><dt>账期快照</dt><dd>30 天</dd></div><div><dt>到期日</dt><dd>2026-09-12</dd></div><div><dt>逾期天数</dt><dd>—</dd></div></dl><div className="source-link"><div><IconFileInvoice size={20} /><span><strong>XSD-20260813-0007</strong><small>已出库 · 成交总额 ¥1,084.00</small></span></div><Button onClick={() => setPage("sales-detail")}>查看来源</Button></div></section><section className="panel"><div className="section-head"><h2>收款与撤销记录</h2></div>{!paid ? <EmptyState createLabel="登记第一笔收款" onCreate={() => setDrawer("payment")} /> : <div className="payment-timeline"><div className={reversed ? "reversed" : ""}><i><IconWallet size={18} /></i><div><strong>收款 ¥400.00</strong><span>2026-08-13 · 银行转账 · SK20260813001</span>{reversed && <small>此收款已撤销</small>}</div>{!reversed && <Button variant="danger" onClick={() => setModal("reverse")}>撤销收款</Button>}</div>{reversed && <div className="reverse-entry"><i><IconRefresh size={18} /></i><div><strong>撤销收款 +¥400.00 未收金额</strong><span>2026-08-13 14:35 · 刘芳 · 金额录入错误</span></div></div>}</div>}</section></div></>;
}

function Imports() {
  const [state, setState] = useState("upload");
  return <><PageHeader title="导入工作台" description="SKU、客户与期初库存使用固定 .xlsx 模板" /><div className="steps"><span className="active">1 选择类型</span><span className={state !== "upload" ? "active" : ""}>2 上传并校验</span><span className={state === "success" ? "active" : ""}>3 确认写入</span></div><section className="panel import-panel"><div className="import-types">{["SKU", "客户", "期初库存"].map((x, i) => <button key={x} className={i === 0 ? "selected" : ""}><IconFileSpreadsheet size={24} /><strong>{x}</strong><span>{i === 0 ? "建立商品资料" : i === 1 ? "建立客户资料" : "建立库存流水起点"}</span></button>)}</div><div className="template-row"><div><strong>先使用标准模板</strong><span>最大 10 MB，每次最多 2,000 行，不接受公式</span></div><Button icon={IconDownload}>下载 SKU 模板</Button></div>{state === "upload" ? <button className="dropzone" onClick={() => setState("error")}><IconUpload size={30} /><strong>拖放或选择 .xlsx 文件</strong><span>点击模拟上传一份包含错误行的文件</span></button> : state === "error" ? <><div className="alert danger"><IconAlertCircle size={19} /><div><strong>发现 3 条错误，整批不会写入</strong><span>请修正源文件后重新上传，当前 27 条正确记录不会单独写入。</span></div><Button onClick={() => setState("success")}>改用正确文件</Button></div><DataTable columns={["行号", "字段", "原值", "结果", "错误原因"]} rows={[["6", "SKU 编码", "WJ-LS-001", "错误", "编码已存在"], ["14", "参考售价", "四十八元", "错误", "必须是最多两位小数的金额"], ["22", "库存单位", "", "错误", "必填字段不能为空"]]} statusColumns={[3]} /></> : <><div className="alert success"><IconCircleCheck size={19} /><div><strong>30 行数据全部通过校验</strong><span>确认后将以单个事务写入；发生错误时整批回滚。</span></div></div><DataTable columns={["文件名", "大小", "有效行", "错误行", "解析状态"]} rows={[["sku-template-completed.xlsx", "28 KB", "30", "0", "成功"]]} statusColumns={[4]} /><div className="import-confirm"><Button onClick={() => setState("upload")}>重新上传</Button><Button variant="primary">确认导入 30 个 SKU</Button></div></>}</section></>;
}

function Audit() {
  const [search, setSearch] = useState("");
  return <><PageHeader title="业务审计" description="关键经营动作的只追加记录，不代表防篡改或合规认证" /><section className="panel list-panel"><FilterBar search={search} setSearch={setSearch}><select><option>全部动作</option></select><select><option>全部操作者</option></select></FilterBar><DataTable columns={["发生时间", "操作者", "动作", "对象", "关联编号", "原因或摘要"]} rows={[["2026-08-13 14:35", "刘芳", "撤销收款", "收款 SK20260813001", "YS-20260813-0007", "金额录入错误；未收金额恢复 ¥400.00"], ["2026-08-13 10:12", "王强", "出库", "销售单", "XSD-20260813-0007", "完整出库 2 个 SKU，自动生成应收"], ["2026-08-13 09:26", "陈敏", "确认销售单", "销售单", "XSD-20260813-0007", "预占 WJ-LS-001 ×20、WJ-QP-004 ×30"], ["2026-08-13 08:50", "张伟", "导出", "应收列表", "—", "按当前权限与筛选导出 12 条记录"]]} /></section></>;
}

function Accounts() {
  const [search, setSearch] = useState("");
  return <><PageHeader title="账号与角色" description="管理本地演示账号、启用状态与固定角色"><Button variant="primary" icon={IconPlus}>新建账号</Button></PageHeader><section className="panel list-panel"><FilterBar search={search} setSearch={setSearch}><select><option>全部角色</option></select><select><option>全部状态</option></select></FilterBar><DataTable columns={["姓名", "邮箱", "角色", "状态", "最近登录", "操作"]} rows={[["张伟", "owner@example.local", "老板、财务", "启用", "2026-08-13 09:10", "编辑"], ["陈敏", "sales@example.local", "销售", "启用", "2026-08-13 09:18", "编辑"], ["王强", "warehouse@example.local", "仓库", "启用", "2026-08-13 10:02", "编辑"], ["刘芳", "finance@example.local", "财务", "启用", "2026-08-13 14:20", "编辑"], ["赵磊", "multi@example.local", "销售、仓库", "停用", "2026-08-12 17:14", "编辑"]]} statusColumns={[3]} /></section></>;
}

export function App() {
  const [page, setPage] = useState("sales-detail");
  const [role, setRole] = useState("owner");
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [stage, setStage] = useState("confirmed");
  const [paid, setPaid] = useState(true);
  const [reversed, setReversed] = useState(false);
  const [shortage, setShortage] = useState(false);
  if (page === "login") return <Login onLogin={() => { setRole("owner"); setPage("sales-detail"); }} />;
  let content;
  if (page === "overview") content = <Overview setPage={setPage} />;
  else if (["sales", "customers", "skus", "inventory", "receivables"].includes(page)) content = <ListPage type={page} setPage={setPage} />;
  else if (page === "sku-detail") content = <EntityForm type="sku" setPage={setPage} />;
  else if (page === "sku-new") content = <EntityForm type="sku" setPage={setPage} isNew />;
  else if (page === "customer-detail") content = <EntityForm type="customer" setPage={setPage} />;
  else if (page === "customer-new") content = <EntityForm type="customer" setPage={setPage} isNew />;
  else if (page === "sales-new") content = <SalesDraft setPage={setPage} setModal={setModal} shortage={shortage} setShortage={setShortage} />;
  else if (page === "sales-detail") content = <SalesDetail setPage={setPage} stage={stage} setStage={setStage} setModal={setModal} />;
  else if (page === "outbound") content = <Outbound setModal={setModal} />;
  else if (page === "ledger") content = <Ledger />;
  else if (page === "receivable-detail") content = <ReceivableDetail paid={paid} setPaid={setPaid} reversed={reversed} setModal={setModal} setDrawer={setDrawer} setPage={setPage} />;
  else if (page === "imports") content = <Imports />;
  else if (page === "audit") content = <Audit />;
  else if (page === "accounts") content = <Accounts />;
  else content = <Overview setPage={setPage} />;
  return <AppShell page={page} setPage={setPage} role={role} setRole={setRole} mobileNav={mobileNav} setMobileNav={setMobileNav}>{content}
    {modal === "confirm" && <Modal title="确认销售单" actionLabel="确认并预占库存" onClose={() => setModal(null)} action={() => { setStage("confirmed"); setModal(null); setPage("sales-detail"); }}><div className="confirm-summary"><span>销售单</span><strong>XSD-20260813-0007</strong><span>客户</span><strong>广顺五金商行</strong><span>明细与金额</span><strong>2 行 · ¥1,084.00</strong></div><div className="impact-note"><IconLock size={20} /><div><strong>确认后内容冻结并预占库存</strong><p>现存量不变，预占量增加，可用量减少；任一 SKU 库存不足时整单不会确认。</p></div></div></Modal>}
    {modal === "cancel" && <Modal title="取消销售单" danger actionLabel="取消并释放预占" onClose={() => setModal(null)} action={() => { setStage("cancelled"); setModal(null); setPage("sales-detail"); }}><CancelSalesOrderPreview /></Modal>}
    {modal === "outbound" && <Modal title="完成整单出库" actionLabel="完成整单出库" onClose={() => setModal(null)} action={() => { setStage("outbound"); setModal(null); setPage("sales-detail"); }}><div className="alert info"><IconPackageExport size={19} />必须整单出库，不能修改数量。</div><DataTable columns={["SKU", "名称", "应出数量"]} rows={[["WJ-LS-001", "304 不锈钢六角螺栓 M8×30", "20 盒"], ["WJ-QP-004", "树脂切割片 105mm", "30 片"]]} /><p>完成后现存量与预占量同时减少，并自动生成一笔经营应收。</p></Modal>}
    {modal === "reverse" && <Modal title="撤销这笔收款" danger actionLabel="撤销这笔收款" onClose={() => setModal(null)} action={() => { setReversed(true); setPaid(false); setModal(null); }}><div className="confirm-summary"><span>原收款日期</span><strong>2026-08-13</strong><span>金额与方式</span><strong>¥400.00 · 银行转账</strong><span>撤销后未收金额</span><strong>¥1,084.00</strong></div><Field label="撤销原因" required><textarea defaultValue="金额录入错误" /></Field></Modal>}
    {drawer === "payment" && <Drawer title="登记收款" onClose={() => setDrawer(null)} footer={<><Button onClick={() => setDrawer(null)}>取消</Button><Button variant="primary" onClick={() => { setPaid(true); setReversed(false); setDrawer(null); }}>登记收款</Button></>}><div className="drawer-summary"><span>当前未收金额</span><strong>¥{paid ? "684.00" : "1,084.00"}</strong></div><Field label="收款日期" required><input type="date" defaultValue="2026-08-13" /></Field><Field label="金额" required><div className="input-action"><input defaultValue="400.00" /><button>填入全部未收金额</button></div></Field><Field label="收款方式" required><select><option>银行转账</option><option>现金</option><option>微信</option><option>支付宝</option><option>其他</option></select></Field><Field label="参考号"><input defaultValue="SK20260813001" /></Field><Field label="备注"><textarea placeholder="可选" /></Field><div className="after-summary"><span>本次收款 <strong>¥400.00</strong></span><span>登记后未收金额 <strong>¥{paid ? "284.00" : "684.00"}</strong></span><span>预计结算状态 <Status>部分收款</Status></span></div></Drawer>}
  </AppShell>;
}
