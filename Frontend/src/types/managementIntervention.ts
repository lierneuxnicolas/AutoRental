export type InterventionType = 'MECANIQUE' | 'NETTOYAGE'

export type InterventionStatus =
  | 'A_ATTRIBUER'
  | 'ATTRIBUEE'
  | 'PLANIFIEE'
  | 'EN_COURS'
  | 'EN_PAUSE'
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

export interface InterventionAssignableUser {
  id: number
  email: string
  first_name: string
  last_name: string
  role: 'MECANICIEN' | 'NETTOYEUR'
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

export interface ManagementInterventionPlanRequest {
  vehicle_id: number
  type: InterventionType
  assigned_user_id: number
  planned_start_at: string
  planned_end_at: string
  description: string
}

export type InterventionDecision = 'RETURN_TO_PARK' | 'MARK_UNAVAILABLE' | 'PLAN_MAINTENANCE' | 'PLAN_CLEANING'

export interface InterventionPlanningConflictReservation {
  id: number
  reference: string
  client: string
  start_at: string
  end_at: string
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
  check_in?: unknown
  check_out?: unknown
  work_data?: Record<string, unknown> | null
  work_periods: Array<{ id: number; started_at: string; ended_at: string | null }>
  final_report?: Record<string, unknown> | null
  estimated_cost?: string | number | null
  planned_start_at?: string | null
  planned_end_at?: string | null
  started_at?: string | null
  completed_at?: string | null
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
