import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:translate-y-[1px]",
  {
    variants: {
      variant: {
        default:
          "bg-[#d96543] text-white shadow-clay-sm hover:bg-[#c55635] border border-[#b84a2b]/40",
        destructive:
          "bg-[#c93b3b] text-white shadow-clay-sm hover:bg-[#b12e2e] border border-[#962222]/40",
        outline:
          "border-2 border-[#d8cbb8] bg-[#fbf6ee]/90 text-[#3d3126] shadow-clay-sm hover:bg-[#f3e9d9]",
        secondary:
          "bg-[#ede1cf] text-[#3d3126] shadow-clay-sm hover:bg-[#e3d3bc] border border-[#d5c4ac]",
        ghost: "hover:bg-[#ede1cf]/70 text-[#4a3b2c]",
        link: "text-[#d96543] underline-offset-4 hover:underline",
        emerald:
          "bg-[#2d7a5e] text-white shadow-clay-sm hover:bg-[#23634b] border border-[#1d523e]/40",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-2xl px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

