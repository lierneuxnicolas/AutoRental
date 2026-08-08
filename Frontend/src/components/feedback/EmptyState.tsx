import type { ReactNode } from 'react'
import Card from '../ui/Card'

export interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Card className="mx-auto max-w-xl text-center" header={<div className="text-lg font-semibold text-[#1F2937]">{title}</div>}>
      <p className="text-sm leading-6 text-slate-600">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Card>
  )
}