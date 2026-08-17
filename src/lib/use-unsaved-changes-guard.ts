"use client";

import { useEffect } from "react";

export function useUnsavedChangesGuard(
  dirty: boolean,
  message = "表单尚未保存，确认离开吗？",
) {
  useEffect(() => {
    if (!dirty) return;
    const confirmLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    const confirmLinkNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const navigationTarget = target.closest<HTMLElement>(
        "a[href], [data-navigation-action]",
      );
      if (!navigationTarget) return;
      if (
        navigationTarget instanceof HTMLAnchorElement &&
        (navigationTarget.target === "_blank" ||
          navigationTarget.hasAttribute("download"))
      ) {
        return;
      }
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    let bypassHistoryGuard = false;
    const guardState = { unsavedChangesGuard: true, createdAt: Date.now() };
    window.history.pushState(guardState, "", window.location.href);
    const confirmHistoryNavigation = () => {
      if (bypassHistoryGuard) return;
      if (window.confirm(message)) {
        bypassHistoryGuard = true;
        window.history.back();
      } else {
        window.history.pushState(guardState, "", window.location.href);
      }
    };
    window.addEventListener("beforeunload", confirmLeave);
    window.addEventListener("popstate", confirmHistoryNavigation);
    document.addEventListener("click", confirmLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", confirmLeave);
      window.removeEventListener("popstate", confirmHistoryNavigation);
      document.removeEventListener("click", confirmLinkNavigation, true);
    };
  }, [dirty, message]);
}
