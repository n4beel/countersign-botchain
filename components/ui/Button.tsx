"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "signature" | "danger" | "ghost";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#5B3FD0] text-white hover:bg-[#4E34B5] border border-transparent shadow-sm active:translate-y-px",
  secondary:
    "bg-[#F6F4FB] text-[#1C1B33] hover:bg-[#EBE7F6] border border-[#CFC8E6]",
  signature:
    "bg-[#5B3FD0] text-white hover:bg-[#4A2FB8] font-serif italic tracking-wide px-3.5 py-1 border border-[#5B3FD0] shadow-[0_2px_6px_rgba(91,63,208,0.25)] active:translate-y-px",
  danger:
    "bg-white text-[#A3263A] hover:bg-[#FFF0F2] border border-[#E8ACB5]",
  ghost:
    "bg-transparent text-[#5A5878] hover:text-[#1C1B33] hover:bg-[#F6F4FB] border border-transparent",
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "px-2 py-0.5 text-[11px]",
  sm: "px-3 py-1.5 text-[12px]",
  md: "px-4 py-2 text-[13px]",
  lg: "px-5 py-2.5 text-[14px]",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      children,
      className = "",
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "sheet-action-button inline-flex items-center justify-center gap-2",
          "font-medium tracking-[0.015em] transition-all duration-150",
          "cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed rounded-[2px]",
          sizeStyles[size],
          variantStyles[variant],
          className,
        ].join(" ")}
        {...rest}
      >
        {loading && (
          <span
            className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
