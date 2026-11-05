import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#d96543] text-white shadow-sm",
        secondary:
          "border-[#d8cbb8] bg-[#f1e7d6] text-[#4a3b2c]",
        destructive:
          "border-red-300 bg-red-100 text-red-800",
        outline: "border-[#cbbba2] text-[#4a3b2c] bg-[#fbf6ee]/70",
        emerald:
          "border-emerald-300 bg-emerald-100 text-emerald-900",
        amber:
          "border-amber-300 bg-amber-100 text-amber-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

