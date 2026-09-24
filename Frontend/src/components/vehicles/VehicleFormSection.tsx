import type { ReactNode } from 'react'

interface VehicleFormSectionProps {
  title: string
  children: ReactNode
}

export default function VehicleFormSection({ title, children }: VehicleFormSectionProps) {
  return (
    <section className="space-y-5 rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-[#0F172A]">{title}</h2>
      {children}
    </section>
  )
}
