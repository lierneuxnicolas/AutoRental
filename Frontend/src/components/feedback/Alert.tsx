import { cn } from '../ui/cn'

type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

export interface AlertProps {
  variant?: AlertVariant
  title?: string
  message: string
}

const variantClasses: Record<AlertVariant, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  success: 'border-green-200 bg-green-50 text-green-800',
  warning: 'border-orange-200 bg-orange-50 text-orange-800',
  danger: 'border-red-200 bg-red-50 text-red-800',
}

export default function Alert({ variant = 'info', title, message }: AlertProps) {
  return (
    <div className={cn('rounded-3xl border px-4 py-3 shadow-sm', variantClasses[variant])} role="alert">
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <p className="text-sm leading-6">{message}</p>
    </div>
  )
}