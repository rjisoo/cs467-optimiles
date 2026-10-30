import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "form-control flex min-h-20 dark:disabled:bg-input/80",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
