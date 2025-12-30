import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Info, XOctagon, X } from "lucide-react";

// Define variants for the alert toast using cva
const alertToastVariants = cva(
  "relative w-full max-w-sm overflow-hidden rounded-lg shadow-lg flex items-center p-4 gap-3",
  {
    variants: {
      variant: {
        success: "",
        warning: "",
        info: "",
        error: "",
      },
      styleVariant: {
        default: "bg-white border border-black/20",
        filled: "",
      },
    },
    compoundVariants: [
      {
        variant: "success",
        styleVariant: "default",
        className: "text-black border-black/20",
      },
      {
        variant: "warning",
        styleVariant: "default",
        className: "text-black border-black/20",
      },
      {
        variant: "info",
        styleVariant: "default",
        className: "text-black border-black/20",
      },
      {
        variant: "error",
        styleVariant: "default",
        className: "text-black border-black/20",
      },
      {
        variant: "success",
        styleVariant: "filled",
        className: "bg-green-500 text-white",
      },
      {
        variant: "warning",
        styleVariant: "filled",
        className: "bg-yellow-500 text-black",
      },
      {
        variant: "info",
        styleVariant: "filled",
        className: "bg-blue-500 text-white",
      },
      {
        variant: "error",
        styleVariant: "filled",
        className: "bg-red-500 text-white",
      },
    ],
    defaultVariants: {
      variant: "info",
      styleVariant: "default",
    },
  }
);

// Define icon map for different variants
const iconMap = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  error: XOctagon,
};

// Define icon color classes
const iconColorClasses: Record<string, Record<string, string>> = {
  default: {
    success: "text-black",
    warning: "text-yellow-600",
    info: "text-blue-600",
    error: "text-red-600",
  },
  filled: {
    success: "text-white",
    warning: "text-black",
    info: "text-white",
    error: "text-white",
  },
};

export interface AlertToastProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertToastVariants> {
  /** The title of the alert. */
  title: string;
  /** A more detailed description for the alert. */
  description: string;
  /** A function to call when the alert is dismissed. */
  onClose: () => void;
}

const AlertToast = React.forwardRef<HTMLDivElement, AlertToastProps>(
  (
    {
      className,
      variant = "info",
      styleVariant = "default",
      title,
      description,
      onClose,
      ...props
    },
    ref
  ) => {
    const Icon = iconMap[variant!];

    return (
      <motion.div
        ref={ref}
        role="alert"
        layout
        initial={{ opacity: 0, y: 50, scale: 0.3 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.5 }}
        transition={{
          type: "spring",
          stiffness: 260,
          damping: 20,
        }}
        className={cn(alertToastVariants({ variant, styleVariant }), className)}
      >
        {/* Icon - properly centered */}
        <div className="flex items-center justify-center flex-shrink-0">
          <Icon
            className={cn("h-5 w-5", iconColorClasses[styleVariant!][variant!])}
            aria-hidden="true"
            strokeWidth={2}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-black">{title}</p>
          <p className="text-sm text-black/70">{description}</p>
        </div>

        {/* Close Button */}
        <div className="flex-shrink-0">
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-full text-black/50 hover:text-black hover:bg-black/5 focus:outline-none transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    );
  }
);

AlertToast.displayName = "AlertToast";

export { AlertToast, alertToastVariants };
