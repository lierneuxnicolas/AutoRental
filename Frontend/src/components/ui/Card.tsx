import type { ReactNode } from 'react'
import { cn } from './cn'

export interface CardProps {
  children: ReactNode
  className?: string
  header?: ReactNode
  footer?: ReactNode
}

export default function Card({ children, className, header, footer }: CardProps) {
  return (
    <section className={cn('overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm', className)}>
      {header ? <div className="border-b border-slate-200 px-6 py-4">{header}</div> : null}
      <div className="px-6 py-5">{children}</div>
      {footer ? <div className="border-t border-slate-200 px-6 py-4">{footer}</div> : null}
    </section>
  )
}