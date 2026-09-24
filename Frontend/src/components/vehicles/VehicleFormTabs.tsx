import type { ReactNode } from 'react'

export type VehicleFormTab = 'features' | 'equipment' | 'conditions'

interface VehicleFormTabsProps {
  activeTab: VehicleFormTab
  onTabChange: (tab: VehicleFormTab) => void
  children: ReactNode
}

const tabs: Array<{ id: VehicleFormTab; label: string }> = [
  { id: 'features', label: 'Caractéristiques' },
  { id: 'equipment', label: 'Équipements' },
  { id: 'conditions', label: 'Conditions' },
]

export default function VehicleFormTabs({ activeTab, onTabChange, children }: VehicleFormTabsProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 p-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={[
              'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-[#2563EB] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  )
}
