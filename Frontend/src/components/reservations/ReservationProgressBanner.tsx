import { Fragment } from 'react'

export type ReservationProgressStatus = 'done' | 'active' | 'future'

export type ReservationProgressStep = {
  order: number
  label: string
  status: ReservationProgressStatus
}

type ReservationProgressBannerProps = {
  steps: ReservationProgressStep[]
  ariaLabel?: string
  className?: string
}

export default function ReservationProgressBanner({
  steps,
  ariaLabel = 'Progression de reservation',
  className,
}: ReservationProgressBannerProps) {
  const displayedCurrentStep = steps.find((step) => step.status === 'active')?.order ?? 1

  return (
    <nav aria-label={ariaLabel} className={className}>
      <div className="pb-2">
        <ol className="flex w-full items-start gap-2 sm:gap-3">
          {steps.map((step, index) => {
            const isCompleted = step.order < displayedCurrentStep || step.status === 'done'
            const isCurrent = step.order === displayedCurrentStep && step.status === 'active'

            return (
              <Fragment key={step.order}>
                <li className="flex min-w-0 flex-1 flex-col items-center text-center">
                  <span
                    aria-current={isCurrent ? 'step' : undefined}
                    className={[
                      'flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold',
                      isCompleted
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : isCurrent
                          ? 'border-indigo-600 bg-linear-to-br from-blue-600 to-violet-600 text-white'
                          : 'border-slate-300 bg-slate-100 text-slate-600',
                    ].join(' ')}
                  >
                    {isCompleted ? '✓' : step.order}
                  </span>
                  <span
                    className={[
                      'mt-2 text-xs font-medium leading-snug sm:text-sm',
                      isCurrent ? 'text-slate-900' : 'text-slate-500',
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                </li>

                {index < steps.length - 1 ? (
                  <li
                    aria-hidden="true"
                    className={[
                      'mt-5 h-0.5 flex-1 rounded sm:mt-6',
                      step.status === 'done' ? 'bg-emerald-500' : 'bg-slate-300',
                    ].join(' ')}
                  />
                ) : null}
              </Fragment>
            )
          })}
        </ol>
      </div>
    </nav>
  )
}