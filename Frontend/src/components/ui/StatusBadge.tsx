import { cn } from './cn'

export type StatusVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface StatusBadgeProps {
  variant?: StatusVariant
  label: string
}

const variantClasses: Record<StatusVariant, string> = {
  neutral: 'bg-[#F5F5F5] text-[#1F2937]',
  info: 'bg-[#DBEAFE] text-[#2563EB]',
  success: 'bg-[#DCFCE7] text-[#15803D]',
  warning: 'bg-[#FFEDD5] text-[#C2410C]',
  danger: 'bg-[#FEE2E2] text-[#B91C1C]',
}

export default function StatusBadge({ variant = 'neutral', label }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', variantClasses[variant])}>
      {label}
    </span>
  )
}