export type WorkerInterventionRole = 'mechanic' | 'cleaning'

export type WorkerInterventionType = 'MECANIQUE' | 'NETTOYAGE'

export type WorkerInterventionStatus =
  | 'A_ATTRIBUER'
  | 'ATTRIBUEE'
  | 'PLANIFIEE'
  | 'EN_COURS'
  | 'EN_PAUSE'
  | 'TERMINEE'
  | 'ANNULEE'

export interface WorkerInterventionVehicleSummary {
  id: number
  registration_number: string
  brand: string
  model_name: string
  color: string
  parking_name?: string | null
  parking_space_number?: string | null
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
  check_in?: WorkerInterventionCheckIn | null
  check_out?: WorkerInterventionCheckIn | null
  estimated_cost?: string | number | null
  planned_start_at?: string | null
  planned_end_at?: string | null
  started_at?: string | null
  completed_at?: string | null
  work_data?: WorkerInterventionWorkData | null
  work_periods: WorkerInterventionWorkPeriod[]
  final_report?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface WorkerInterventionWorkPeriod {
  id: number
  started_at: string
  ended_at: string | null
}

export interface WorkerInterventionWorkData {
  [key: string]: string | boolean | number | null | undefined
}

export interface WorkerInterventionWorkValues {
  work_data: WorkerInterventionWorkData
  estimated_cost?: number | null
}

export interface WorkerInterventionCheckOutValues {
  final_mileage: number
  final_energy_level_percent: number
  anomaly_present: boolean
  anomaly_description?: string
  anomaly_severity?: 'ACCEPTABLE' | 'GRAVE'
  photos: File[]
}

export interface WorkerInterventionCheckInPhoto {
  id: number
  file: string | null
  caption: string
  created_at: string
}

export interface WorkerInterventionCheckIn {
  id: number
  mileage: number
  energy_level_percent: number
  observations: string
  created_at: string
  photos: WorkerInterventionCheckInPhoto[]
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

export interface WorkerInterventionCheckInValues {
  mileage: number
  energy_level_percent: number
  anomaly_present: boolean
  anomaly_description?: string
  anomaly_severity?: 'ACCEPTABLE' | 'GRAVE'
  photos: File[]
}

export interface WorkerInterventionInterruptValues {
  reason_type: 'vehicule_accidente' | 'probleme_securite' | 'vehicule_inaccessible' | 'vehicule_non_deplacable' | 'mauvais_vehicule' | 'autre'
  reason_detail?: string
  photo?: File | null
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
