type DepartureStepStatus = 'done' | 'active' | 'future'

type DepartureStep = {
  index: number
  label: string
  status: DepartureStepStatus
}

interface DepartureFlowProgressProps {
  steps: DepartureStep[]
}

function stepClasses(status: DepartureStepStatus): string {
  if (status === 'done') {
    return 'border-[#16A34A] bg-[#DCFCE7] text-[#166534]'
  }

  if (status === 'active') {
    return 'border-[#7C3AED] bg-[#EDE9FE] text-[#5B21B6]'
  }

  return 'border-[#CBD5E1] bg-[#F1F5F9] text-[#64748B]'
}

function connectorClasses(status: DepartureStepStatus): string {
  if (status === 'done') {
    return 'bg-[#16A34A]'
  }

  if (status === 'active') {
    return 'bg-[#7C3AED]'
  }

  return 'bg-[#CBD5E1]'
}

function stepBadge(step: DepartureStep): string {
  return step.status === 'done' ? '✓' : String(step.index)
}

export default function DepartureFlowProgress({ steps }: DepartureFlowProgressProps) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-4 sm:px-5">
      <ol className="grid gap-3 sm:grid-cols-4 sm:gap-4">
        {steps.map((step, index) => (
          <li key={step.index} className="relative">
            <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium ${stepClasses(step.status)}`}>
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current text-sm font-semibold">
                {stepBadge(step)}
              </span>
              <span className="truncate">{step.label}</span>
            </div>

            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`hidden sm:block absolute top-1/2 -right-2 h-0.5 w-4 -translate-y-1/2 ${connectorClasses(step.status)}`}
              />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
