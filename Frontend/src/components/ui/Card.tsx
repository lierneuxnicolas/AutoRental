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
    <section className={cn('overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]', className)}>
      {header ? <div className="border-b border-[#E5E7EB] bg-[#F5F5F5] px-6 py-4">{header}</div> : null}
      <div className="px-6 py-5">{children}</div>
      {footer ? <div className="border-t border-[#E5E7EB] px-6 py-4">{footer}</div> : null}
    </section>
  )
}