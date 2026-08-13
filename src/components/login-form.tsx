"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const loginSchema = z.object({
  email: z.email("请输入有效邮箱。"),
  password: z.string().min(1, "请输入密码。"),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

export function LoginForm() {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const formData = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      const flattened = z.flattenError(parsed.error).fieldErrors;
      setFieldErrors({
        email: flattened.email?.[0],
        password: flattened.password?.[0],
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email(parsed.data);

      if (result.error) {
        setFormError("邮箱或密码不正确，请检查后重试。");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setFormError("登录服务暂不可用，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid w-full max-w-[390px] gap-5" onSubmit={handleSubmit}>
      <div>
        <span className="text-xs font-bold text-[#2563eb]">欢迎回来</span>
        <h1 className="mt-2 text-[25px] leading-tight font-bold tracking-[-0.02em] text-[#17202a]">
          登录工作区
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-[#667085]">
          使用预置演示账号进入与角色相符的首页。
        </p>
      </div>

      {formError ? (
        <div
          role="alert"
          className="flex min-h-14 items-center gap-2.5 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-4 py-3 text-[13px] text-[#c62828]"
        >
          <IconAlertCircle aria-hidden size={18} />
          <span>{formError}</span>
        </div>
      ) : null}

      <label className="grid gap-2 text-[13px] font-semibold text-[#475467]">
        <span>
          邮箱 <b className="text-[#c62828]">*</b>
        </span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          defaultValue="owner@example.local"
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15"
        />
        {fieldErrors.email ? (
          <span id="email-error" className="font-normal text-[#c62828]">
            {fieldErrors.email}
          </span>
        ) : null}
      </label>

      <label className="grid gap-2 text-[13px] font-semibold text-[#475467]">
        <span>
          密码 <b className="text-[#c62828]">*</b>
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          defaultValue="demo123456"
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15"
        />
        {fieldErrors.password ? (
          <span id="password-error" className="font-normal text-[#c62828]">
            {fieldErrors.password}
          </span>
        ) : null}
      </label>

      <Button
        variant="primary"
        type="submit"
        disabled={isSubmitting}
        className="min-h-11 w-full"
      >
        {isSubmitting ? "登录中…" : "登录"}
      </Button>

      <div className="grid gap-1 rounded-[7px] bg-[#f7f9fb] p-3.5">
        <strong className="text-[13px] text-[#17202a]">
          演示账号 · 密码 demo123456
        </strong>
        <span className="text-xs leading-5 text-[#667085]">
          owner · sales · warehouse · finance · multi @example.local
        </span>
      </div>
    </form>
  );
}
