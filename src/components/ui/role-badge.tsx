import type { Role } from "@/application/auth/resolve-actor";

const roleLabels: Record<Role, string> = {
  OWNER: "老板",
  SALES: "销售",
  WAREHOUSE: "仓库",
  FINANCE: "财务",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded-md border border-[#b6d2ff] bg-[#eff6ff] px-2 text-xs font-semibold text-[#175cd3]">
      {roleLabels[role]}
    </span>
  );
}
