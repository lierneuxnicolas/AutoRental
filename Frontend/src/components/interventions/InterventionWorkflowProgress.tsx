import ReservationProgressBanner from '../reservations/ReservationProgressBanner'

interface InterventionWorkflowStep {
  id: string
  label: string
  done: boolean
}

interface InterventionWorkflowProgressProps {
  activeStep: string
  steps: InterventionWorkflowStep[]
}

export default function InterventionWorkflowProgress({ activeStep, steps }: InterventionWorkflowProgressProps) {
  return (
    <ReservationProgressBanner
      ariaLabel="Progression de l’intervention"
      steps={steps.map((step, index) => ({
        order: index + 1,
        label: step.label,
        status: step.done ? 'done' : activeStep === step.id ? 'active' : 'future',
      }))}
    />
  )
}
