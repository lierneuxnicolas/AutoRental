import { cn } from './cn'

type StatusVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface StatusBadgeProps {
  variant?: StatusVariant
  label: string
}

const variantClasses: Record<StatusVariant, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-orange-100 text-orange-700',
  danger: 'bg-red-100 text-red-700',
}

export default function StatusBadge({ variant = 'neutral', label }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', variantClasses[variant])}>
      {label}
    </span>
  )
}