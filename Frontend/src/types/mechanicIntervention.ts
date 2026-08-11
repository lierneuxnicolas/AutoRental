import type {
  PaginatedWorkerInterventionListResponse,
  WorkerInterventionAssigneeSummary,
  WorkerInterventionCompleteRequest,
  WorkerInterventionListQueryParams,
  WorkerInterventionPhotoResponse,
  WorkerInterventionPhotoUploadRequest,
  WorkerInterventionReservationSummary,
  WorkerInterventionResponse,
  WorkerInterventionStatus,
  WorkerInterventionType,
  WorkerInterventionVehicleSummary,
} from './workerIntervention'

export type MechanicInterventionType = WorkerInterventionType

export type MechanicInterventionStatus = WorkerInterventionStatus

export type MechanicInterventionVehicleSummary = WorkerInterventionVehicleSummary

export type MechanicInterventionReservationSummary = WorkerInterventionReservationSummary

export type MechanicInterventionAssigneeSummary = WorkerInterventionAssigneeSummary

export type MechanicInterventionResponse = WorkerInterventionResponse

export type PaginatedMechanicInterventionListResponse = PaginatedWorkerInterventionListResponse

export type MechanicInterventionListQueryParams = WorkerInterventionListQueryParams

export interface MechanicInterventionStartRequest {
  reference: string
  intervention_type: MechanicInterventionType
  status?: MechanicInterventionStatus
  description?: string
}

export type MechanicInterventionCompleteRequest = WorkerInterventionCompleteRequest

export type MechanicInterventionPhotoUploadRequest = WorkerInterventionPhotoUploadRequest

export type MechanicInterventionPhotoResponse = WorkerInterventionPhotoResponse
