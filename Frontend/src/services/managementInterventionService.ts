import api from './api'
import type {
  ManagementInterventionAssignRequest,
  ManagementInterventionCreateRequest,
  ManagementInterventionListQueryParams,
  ManagementInterventionResponse,
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

export async function createManagementIntervention(
  payload: ManagementInterventionCreateRequest,
): Promise<ManagementInterventionResponse> {
  const { data } = await api.post<ManagementInterventionResponse>('/management/interventions/', payload)
  return data
}

export async function assignManagementIntervention(
  id: number,
  payload: ManagementInterventionAssignRequest,
): Promise<ManagementInterventionResponse> {
  const { data } = await api.patch<ManagementInterventionResponse>(`/management/interventions/${id}/assign/`, payload)
  return data
}
