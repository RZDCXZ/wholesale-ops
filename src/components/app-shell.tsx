"use client";

import {
  IconBox,
  IconChartBar,
  IconChevronDown,
  IconChevronRight,
  IconFileInvoice,
  IconLogout,
  IconMenu2,
  IconPackageExport,
  IconReceipt2,
  IconShieldCheck,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import type { Actor } from "@/application/auth/resolve-actor";
import { getActorNavigation } from "@/application/auth/access-policy";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/role-badge";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const navigationIcons = {
  "/overview": IconChartBar,
  "/sales-orders": IconFileInvoice,
  "/skus": IconBox,
  "/warehouse/outbound": IconPackageExport,
  "/receivables": IconReceipt2,
  "/audit": IconShieldCheck,
  "/settings/accounts": IconUser,
};

export type AppShellActor = Pick<Actor, "name" | "email" | "roles">;

export function AppShell({
  actor,
  children,
}: {
  actor: AppShellActor;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const actorNavigation = getActorNavigation(actor);
  const groupedNavigation = actorNavigation.reduce<
    Array<{ group: string; items: typeof actorNavigation }>
  >((groups, item) => {
    const currentGroup = groups.at(-1);
    if (currentGroup?.group === item.group) {
      currentGroup.items.push(item);
    } else {
      groups.push({ group: item.group, items: [item] });
    }
    return groups;
  }, []);
  const activeItem = actorNavigation.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );

  async function signOut() {
    setLogoutError(undefined);
    const result = await authClient.signOut();

    if (result.error) {
      setLogoutError("暂时无法退出，请重试。");
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-svh bg-[#f6f7f9] text-[#17202a]">
      {isMobileNavOpen ? (
        <button
          type="button"
          aria-label="关闭导航"
          className="fixed inset-0 z-30 border-0 bg-slate-900/35 md:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[236px] -translate-x-full flex-col overflow-y-auto border-r border-[#e4e7ec] bg-white transition-transform md:translate-x-0",
          isMobileNavOpen && "translate-x-0 shadow-[14px_0_40px_rgba(16,24,40,0.16)]",
        )}
      >
        <div className="flex h-[66px] shrink-0 items-center justify-between border-b border-[#e4e7ec] px-5">
          <div>
            <strong className="block text-[21px] leading-6 tracking-[0.01em]">
              批发经营台账
            </strong>
            <span className="mt-0.5 block text-[13px] text-[#667085]">
              Wholesale Ops
            </span>
          </div>
          <button
            type="button"
            aria-label="关闭导航"
            className="grid size-11 place-items-center rounded-lg border-0 bg-transparent hover:bg-[#f2f4f7] md:hidden"
            onClick={() => setIsMobileNavOpen(false)}
          >
            <IconX aria-hidden size={21} />
          </button>
        </div>

        <nav aria-label="主导航" className="px-2 py-3">
          {groupedNavigation.map(({ group, items }) => (
            <div key={group} className="mb-2">
              <span className="block px-3 py-2 text-[13px] font-semibold text-[#667085]">
                {group}
              </span>
              {items.map((item) => {
                const Icon = navigationIcons[item.href as keyof typeof navigationIcons];
                const active = activeItem?.href === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setIsMobileNavOpen(false)}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-[7px] px-3 text-[15px] font-semibold text-[#344054] hover:bg-[#f6f7f9]",
                      active && "bg-[#eaf2ff] text-[#2563eb] hover:bg-[#eaf2ff]",
                    )}
                  >
                    <Icon aria-hidden size={20} stroke={1.8} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto px-5 py-5 text-xs text-[#98a2b3]">
          本地演示 · 数据均为虚构
        </div>
      </aside>

      <div className="w-full min-w-0 md:ml-[236px] md:w-[calc(100%-236px)]">
        <header className="sticky top-0 z-20 flex h-[58px] items-center justify-between border-b border-[#e4e7ec] bg-white/95 px-3.5 backdrop-blur md:h-[66px] md:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="打开导航"
              className="grid size-11 place-items-center rounded-lg border-0 bg-transparent hover:bg-[#f2f4f7] md:hidden"
              onClick={() => setIsMobileNavOpen(true)}
            >
              <IconMenu2 aria-hidden size={22} />
            </button>
            <div className="flex items-center gap-2 text-[15px] text-[#344054]">
              <span>{activeItem?.label ?? "工作区"}</span>
              <IconChevronRight aria-hidden size={14} className="hidden md:block" />
              <span className="hidden text-[#98a2b3] md:block">工作台</span>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              aria-expanded={isAccountOpen}
              aria-haspopup="menu"
              onClick={() => setIsAccountOpen((open) => !open)}
              className="flex min-h-11 items-center gap-2 rounded-lg border-0 bg-transparent px-1.5 hover:bg-[#f6f7f9]"
            >
              <span className="grid size-[30px] place-items-center rounded-full bg-[#e8edf4] text-[13px] font-bold text-[#344054]">
                {actor.name.slice(0, 1)}
              </span>
              <strong className="hidden text-sm md:block">{actor.name}</strong>
              {actor.roles.map((role) => (
                <span key={role} className="hidden sm:inline-flex">
                  <RoleBadge role={role} />
                </span>
              ))}
              <IconChevronDown aria-hidden size={16} />
            </button>

            {isAccountOpen ? (
              <div
                role="menu"
                className="absolute top-[calc(100%+8px)] right-0 w-60 rounded-[10px] border border-[#e4e7ec] bg-white p-2 shadow-[0_16px_36px_rgba(16,24,40,0.12)]"
              >
                <div className="border-b border-[#e4e7ec] px-2 py-2.5">
                  <strong className="block text-sm">{actor.name}</strong>
                  <span className="mt-1 block text-xs text-[#667085]">
                    {actor.email}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {actor.roles.map((role) => (
                      <RoleBadge key={role} role={role} />
                    ))}
                  </div>
                </div>
                {logoutError ? (
                  <p role="alert" className="px-2 pt-2 text-xs text-[#c62828]">
                    {logoutError}
                  </p>
                ) : null}
                <Button
                  role="menuitem"
                  data-navigation-action="logout"
                  variant="ghost"
                  className="mt-1 w-full justify-start"
                  onClick={signOut}
                >
                  <IconLogout aria-hidden size={18} />
                  退出登录
                </Button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] p-3.5 md:p-6">{children}</main>
      </div>
    </div>
  );
}
