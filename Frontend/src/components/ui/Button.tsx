import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600',
  secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 focus-visible:ring-slate-400',
  success: 'bg-green-500 text-white hover:bg-green-600 focus-visible:ring-green-500',
  danger: 'bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}