import api from './api'
import type {
  PaginatedWorkerInterventionListResponse,
  WorkerInterventionCompleteRequest,
  WorkerInterventionListQueryParams,
  WorkerInterventionPhotoResponse,
  WorkerInterventionPhotoUploadRequest,
  WorkerInterventionResponse,
  WorkerInterventionRole,
} from '../types/workerIntervention'

type WorkerInterventionListApiResponse =
  | PaginatedWorkerInterventionListResponse
  | WorkerInterventionResponse[]

function normalizeInterventionListResponse(
  data: WorkerInterventionListApiResponse,
): PaginatedWorkerInterventionListResponse {
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

function getBasePath(role: WorkerInterventionRole): string {
  return `/${role}/interventions`
}

export async function getInterventions(
  role: WorkerInterventionRole,
  params?: WorkerInterventionListQueryParams,
): Promise<PaginatedWorkerInterventionListResponse> {
  const { data } = await api.get<WorkerInterventionListApiResponse>(`${getBasePath(role)}/`, {
    params,
  })

  return normalizeInterventionListResponse(data)
}

export async function getInterventionById(
  role: WorkerInterventionRole,
  id: number,
): Promise<WorkerInterventionResponse> {
  const { data } = await api.get<WorkerInterventionResponse>(`${getBasePath(role)}/${id}/`)
  return data
}

export async function startIntervention(
  role: WorkerInterventionRole,
  id: number,
): Promise<WorkerInterventionResponse> {
  const { data } = await api.post<WorkerInterventionResponse>(`${getBasePath(role)}/${id}/start/`, {})
  return data
}

export async function uploadInterventionPhoto(
  role: WorkerInterventionRole,
  id: number,
  payload: WorkerInterventionPhotoUploadRequest,
): Promise<WorkerInterventionPhotoResponse> {
  const formData = new FormData()
  formData.append('file', payload.file)

  if (payload.caption !== undefined) {
    formData.append('caption', payload.caption)
  }

  const { data } = await api.post<WorkerInterventionPhotoResponse>(`${getBasePath(role)}/${id}/photos/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return data
}

export async function completeIntervention(
  role: WorkerInterventionRole,
  id: number,
  payload: WorkerInterventionCompleteRequest,
): Promise<WorkerInterventionResponse> {
  const { data } = await api.post<WorkerInterventionResponse>(`${getBasePath(role)}/${id}/complete/`, payload)
  return data
}
