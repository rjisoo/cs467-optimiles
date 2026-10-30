import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "form-control min-h-(--control-min-height) min-w-0",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent",
        "file:text-[length:var(--font-control)] file:font-medium file:text-foreground",
        "dark:disabled:bg-input/80",
        className
      )}
      {...props}
    />
  )
}

export { Input }
