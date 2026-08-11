export type WorkerInterventionRole = 'mechanic' | 'cleaning'

export type WorkerInterventionType = 'MECANIQUE' | 'NETTOYAGE'

export type WorkerInterventionStatus =
  | 'A_ATTRIBUER'
  | 'ATTRIBUEE'
  | 'EN_COURS'
  | 'TERMINEE'
  | 'ANNULEE'

export interface WorkerInterventionVehicleSummary {
  id: number
  registration_number: string
  brand: string
  model_name: string
}

export interface WorkerInterventionReservationSummary {
  id: number
  reference: string
}

export interface WorkerInterventionAssigneeSummary {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
}

export interface WorkerInterventionResponse {
  id: number
  reference: string
  type: string
  intervention_type: WorkerInterventionType
  status: WorkerInterventionStatus
  description: string
  vehicle: WorkerInterventionVehicleSummary
  reservation: WorkerInterventionReservationSummary | null
  assigned_to: WorkerInterventionAssigneeSummary | null
  created_by: WorkerInterventionAssigneeSummary
  created_at: string
  updated_at: string
}

export interface PaginatedWorkerInterventionListResponse {
  count: number
  next: string | null
  previous: string | null
  results: WorkerInterventionResponse[]
}

export interface WorkerInterventionListQueryParams {
  ordering?: string
  page?: number
  search?: string
}

export interface WorkerInterventionCompleteRequest {
  report?: string
}

export interface WorkerInterventionPhotoUploadRequest {
  file: File
  caption?: string
}

export interface WorkerInterventionPhotoResponse {
  id: number
  file: string | null
  caption: string
  created_at: string
}
