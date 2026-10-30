import * as React from "react"
import { cn } from "@/lib/utils"

import { ChevronDownIcon } from "lucide-react"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

function NativeSelect({
  className,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        "group/native-select relative w-full",
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "form-control min-h-(--control-min-height) min-w-0 appearance-none pr-9",
          "select-none selection:bg-primary selection:text-primary-foreground",
          "data-[size=sm]:h-7 data-[size=sm]:min-h-7",
          "data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5",
          "dark:hover:bg-input/50"
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
       />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOption }
