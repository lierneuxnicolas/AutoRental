import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

export interface AlertProps {
  variant?: AlertVariant
  title?: string
  message?: ReactNode
  children?: ReactNode
}

const variantClasses: Record<AlertVariant, string> = {
  info: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]',
  success: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]',
  warning: 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]',
  danger: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
}

export default function Alert({ variant = 'info', title, message, children }: AlertProps) {
  const content = children ?? message

  return (
    <div className={cn('rounded-3xl border px-4 py-3 shadow-sm', variantClasses[variant])} role="alert" aria-live="polite">
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      {content ? (
        typeof content === 'string' ? (
          <p className="text-sm leading-6">{content}</p>
        ) : (
          <div className="text-sm leading-6">{content}</div>
        )
      ) : null}
    </div>
  )
}