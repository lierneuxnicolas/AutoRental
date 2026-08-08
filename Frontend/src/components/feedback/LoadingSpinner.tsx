import type { HTMLAttributes } from 'react'
import { cn } from '../ui/cn'

export type SpinnerSize = 'sm' | 'md' | 'lg'

export interface LoadingSpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: SpinnerSize
  'aria-label'?: string
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-3',
}

export default function LoadingSpinner({ size = 'md', className, 'aria-label': ariaLabel = 'Chargement', ...props }: LoadingSpinnerProps) {
  return (
    <div role="status" aria-label={ariaLabel} className={cn('inline-flex items-center justify-center', className)} {...props}>
      <span className={cn('animate-spin rounded-full border-slate-200 border-t-[#2563EB]', sizeClasses[size])} />
      <span className="sr-only">{ariaLabel}</span>
    </div>
  )
}