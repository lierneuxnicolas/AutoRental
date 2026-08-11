export type InterventionType = 'MECANIQUE' | 'NETTOYAGE'

export type InterventionStatus =
  | 'A_ATTRIBUER'
  | 'ATTRIBUEE'
  | 'EN_COURS'
  | 'TERMINEE'
  | 'ANNULEE'

export interface InterventionVehicleSummary {
  id: number
  registration_number: string
  brand: string
  model_name: string
}

export interface InterventionReservationSummary {
  id: number
  reference: string
}

export interface InterventionAssigneeSummary {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
}

export interface ManagementInterventionCreateRequest {
  vehicle_id: number
  reservation_id?: number | null
  type: InterventionType
  description?: string
}

export interface ManagementInterventionAssignRequest {
  assigned_user_id?: number
}

export interface ManagementInterventionResponse {
  id: number
  reference: string
  type: string
  intervention_type: InterventionType
  status: InterventionStatus
  description: string
  vehicle: InterventionVehicleSummary
  reservation: InterventionReservationSummary | null
  assigned_to: InterventionAssigneeSummary | null
  created_by: InterventionAssigneeSummary
  created_at: string
  updated_at: string
}

export interface PaginatedManagementInterventionListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ManagementInterventionResponse[]
}

export interface ManagementInterventionListQueryParams {
  ordering?: string
  page?: number
  search?: string
}
