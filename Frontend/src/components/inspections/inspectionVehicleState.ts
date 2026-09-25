export type WorkflowAnomalySeverity = 'ACCEPTABLE' | 'GRAVE' | ''

export interface InspectionVehicleStateValues {
  mileage: string
  energy: string
  anomalyPresent: boolean | null
  anomalyDescription: string
  anomalySeverity: WorkflowAnomalySeverity
}

export type ValidInspectionVehicleState = {
  mileage: number
  energy: number
  anomalyPresent: boolean
  anomalyDescription?: string
  anomalySeverity?: Exclude<WorkflowAnomalySeverity, ''>
}

export function validateInspectionVehicleState(values: InspectionVehicleStateValues):
  | { data: ValidInspectionVehicleState; error: null }
  | { data: null; error: string } {
  const mileage = Number(values.mileage)
  if (!values.mileage.trim() || !Number.isInteger(mileage) || mileage < 0) {
    return { data: null, error: 'Le kilométrage doit être un nombre positif ou nul.' }
  }

  const energy = Number(values.energy)
  if (!values.energy.trim() || !Number.isInteger(energy) || energy < 0 || energy > 100) {
    return { data: null, error: 'Le niveau carburant / batterie doit être compris entre 0 et 100.' }
  }

  if (values.anomalyPresent === null) {
    return { data: null, error: 'Indiquez si vous avez constaté une anomalie.' }
  }

  if (values.anomalyPresent && (!values.anomalyDescription.trim() || !values.anomalySeverity)) {
    return { data: null, error: 'La description et la gravité de l’anomalie sont obligatoires.' }
  }

  return {
    data: {
      mileage,
      energy,
      anomalyPresent: values.anomalyPresent,
      anomalyDescription: values.anomalyPresent ? values.anomalyDescription.trim() : undefined,
      anomalySeverity: values.anomalyPresent && values.anomalySeverity ? values.anomalySeverity : undefined,
    },
    error: null,
  }
}
