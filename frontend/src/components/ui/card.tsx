import * as React from "react"
import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) rounded-2xl border border-border bg-card py-(--card-spacing) text-[length:var(--font-body)] leading-[1.45] text-card-foreground [--card-spacing:var(--space-2)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:calc(var(--space-2)*.75)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

export { Card }
