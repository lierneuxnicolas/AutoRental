import api from './api'
import type {
  MechanicInterventionCompleteRequest,
  MechanicInterventionPhotoResponse,
  MechanicInterventionPhotoUploadRequest,
  MechanicInterventionResponse,
  MechanicInterventionStartRequest,
  MechanicInterventionListQueryParams,
  PaginatedMechanicInterventionListResponse,
} from '../types/mechanicIntervention'

type MechanicInterventionListApiResponse =
  | PaginatedMechanicInterventionListResponse
  | MechanicInterventionResponse[]

function normalizeInterventionListResponse(
  data: MechanicInterventionListApiResponse,
): PaginatedMechanicInterventionListResponse {
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

export async function getMechanicInterventions(
  params?: MechanicInterventionListQueryParams,
): Promise<PaginatedMechanicInterventionListResponse> {
  const { data } = await api.get<MechanicInterventionListApiResponse>('/mechanic/interventions/', {
    params,
  })

  return normalizeInterventionListResponse(data)
}

export async function getMechanicInterventionById(id: number): Promise<MechanicInterventionResponse> {
  const { data } = await api.get<MechanicInterventionResponse>(`/mechanic/interventions/${id}/`)
  return data
}

export async function startMechanicIntervention(
  id: number,
  payload?: MechanicInterventionStartRequest,
): Promise<MechanicInterventionResponse> {
  const { data } = await api.post<MechanicInterventionResponse>(`/mechanic/interventions/${id}/start/`, payload ?? {})
  return data
}

export async function uploadMechanicInterventionPhoto(
  id: number,
  payload: MechanicInterventionPhotoUploadRequest,
): Promise<MechanicInterventionPhotoResponse> {
  const formData = new FormData()
  formData.append('file', payload.file)

  if (payload.caption !== undefined) {
    formData.append('caption', payload.caption)
  }

  const { data } = await api.post<MechanicInterventionPhotoResponse>(`/mechanic/interventions/${id}/photos/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return data
}

export async function completeMechanicIntervention(
  id: number,
  payload: MechanicInterventionCompleteRequest,
): Promise<MechanicInterventionResponse> {
  const { data } = await api.post<MechanicInterventionResponse>(`/mechanic/interventions/${id}/complete/`, payload)
  return data
}
