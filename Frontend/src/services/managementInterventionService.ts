import api from './api'
import type {
  InterventionAssignableUser,
  ManagementInterventionAssignRequest,
  ManagementInterventionCreateRequest,
  ManagementInterventionListQueryParams,
  ManagementInterventionPlanRequest,
  ManagementInterventionResponse,
  InterventionDecision,
  PaginatedManagementInterventionListResponse,
} from '../types/managementIntervention'

type ManagementInterventionListApiResponse =
  | PaginatedManagementInterventionListResponse
  | ManagementInterventionResponse[]

function normalizeInterventionListResponse(
  data: ManagementInterventionListApiResponse,
): PaginatedManagementInterventionListResponse {
  if (Array.isArray(data)) {
    return {
      count: data.length,
      next: null,
      previous: null,
      results: data,
    }
  }

  return data
}

export async function getManagementInterventions(
  params?: ManagementInterventionListQueryParams,
): Promise<PaginatedManagementInterventionListResponse> {
  const { data } = await api.get<ManagementInterventionListApiResponse>('/management/interventions/', {
    params,
  })

  return normalizeInterventionListResponse(data)
}

export async function getManagementInterventionAssignees(): Promise<InterventionAssignableUser[]> {
  const { data } = await api.get<InterventionAssignableUser[]>('/management/interventions/assignees/')
  return data
}

export async function createManagementIntervention(
  payload: ManagementInterventionCreateRequest,
): Promise<ManagementInterventionResponse> {
  const { data } = await api.post<ManagementInterventionResponse>('/management/interventions/', payload)
  return data
}

export async function planManagementIntervention(
  payload: ManagementInterventionPlanRequest,
): Promise<ManagementInterventionResponse> {
  const { data } = await api.post<ManagementInterventionResponse>('/management/interventions/plan/', payload)
  return data
}

export async function decideManagementIntervention(
  id: number,
  payload: { decision: InterventionDecision; comment?: string; assigned_user_id?: number; planned_start_at?: string; planned_end_at?: string; description?: string },
): Promise<ManagementInterventionResponse> {
  const { data } = await api.post<ManagementInterventionResponse>(`/management/interventions/${id}/decision/`, payload)
  return data
}

export async function assignManagementIntervention(
  id: number,
  payload: ManagementInterventionAssignRequest,
): Promise<ManagementInterventionResponse> {
  const { data } = await api.patch<ManagementInterventionResponse>(`/management/interventions/${id}/assign/`, payload)
  return data
}
