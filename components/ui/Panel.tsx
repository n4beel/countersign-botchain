import type { HTMLAttributes, ReactNode } from "react";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: "inset" | "marginalia" | "ruled" | "card";
  density?: "compact" | "normal" | "spacious";
  title?: ReactNode;
}

/**
 * Paper sheet panel and marginalia container.
 * Inset sections provide soft lilac recessing on the white paper sheet,
 * while marginalia variant frames the right-hand metadata notes.
 */
export default function Panel({
  variant = "inset",
  density = "normal",
  title,
  children,
  className = "",
  style,
  ...rest
}: PanelProps) {
  const pad =
    density === "compact"
      ? "p-2.5 sm:p-3"
      : density === "spacious"
      ? "p-5 sm:p-7"
      : "p-4 sm:p-5";

  let variantCls = "bg-[#F6F4FB] border border-[#CFC8E6]";
  if (variant === "marginalia") {
    variantCls = "bg-[#F9F8FD] border-l-2 border-[#5B3FD0] pl-3 py-2";
  } else if (variant === "ruled") {
    variantCls = "bg-white border-y border-[#CFC8E6]";
  } else if (variant === "card") {
    variantCls = "bg-white border border-[#CFC8E6] shadow-[0_2px_10px_rgba(28,27,51,0.03)]";
  }

  return (
    <div
      className={`countersign-sheet-section relative ${variantCls} ${pad} ${className}`}
      style={style}
      {...rest}
    >
      {title && (
        <div className="mb-2.5 pb-1 border-b border-[#CFC8E6]/70 flex items-center justify-between text-[11px] font-semibold tracking-[0.06em] uppercase text-[#5A5878]">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
