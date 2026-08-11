export type MechanicInterventionType = 'MECANIQUE' | 'NETTOYAGE'

export type MechanicInterventionStatus =
  | 'A_ATTRIBUER'
  | 'ATTRIBUEE'
  | 'EN_COURS'
  | 'TERMINEE'
  | 'ANNULEE'

export interface MechanicInterventionVehicleSummary {
  id: number
  registration_number: string
  brand: string
  model_name: string
}

export interface MechanicInterventionReservationSummary {
  id: number
  reference: string
}

export interface MechanicInterventionAssigneeSummary {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
}

export interface MechanicInterventionResponse {
  id: number
  reference: string
  type: string
  intervention_type: MechanicInterventionType
  status: MechanicInterventionStatus
  description: string
  vehicle: MechanicInterventionVehicleSummary
  reservation: MechanicInterventionReservationSummary | null
  assigned_to: MechanicInterventionAssigneeSummary | null
  created_by: MechanicInterventionAssigneeSummary
  created_at: string
  updated_at: string
}

export interface PaginatedMechanicInterventionListResponse {
  count: number
  next: string | null
  previous: string | null
  results: MechanicInterventionResponse[]
}

export interface MechanicInterventionListQueryParams {
  ordering?: string
  page?: number
  search?: string
}

export interface MechanicInterventionStartRequest {
  reference: string
  intervention_type: MechanicInterventionType
  status?: MechanicInterventionStatus
  description?: string
}

export interface MechanicInterventionCompleteRequest {
  report?: string
}

export interface MechanicInterventionPhotoUploadRequest {
  file: File
  caption?: string
}

export interface MechanicInterventionPhotoResponse {
  id: number
  file: string | null
  caption: string
  created_at: string
}
