import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[7px] border px-4 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-[#2563eb] bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
        secondary:
          "border-[#d0d5dd] bg-white text-[#344054] hover:bg-[#f9fafb]",
        ghost: "border-transparent bg-transparent text-[#344054] hover:bg-[#f2f4f7]",
      },
      size: {
        default: "px-4",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
