import api from './api'
import type {
  PaginatedWorkerInterventionListResponse,
  WorkerInterventionCheckInValues,
  WorkerInterventionCheckOutValues,
  WorkerInterventionInterruptValues,
  WorkerInterventionCompleteRequest,
  WorkerInterventionListQueryParams,
  WorkerInterventionPhotoResponse,
  WorkerInterventionPhotoUploadRequest,
  WorkerInterventionResponse,
  WorkerInterventionRole,
  WorkerInterventionWorkValues,
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

export async function checkInIntervention(
  role: WorkerInterventionRole,
  id: number,
  payload: WorkerInterventionCheckInValues,
): Promise<WorkerInterventionResponse> {
  const formData = new FormData()
  formData.append('mileage', String(payload.mileage))
  formData.append('energy_level_percent', String(payload.energy_level_percent))
  formData.append('anomaly_present', String(payload.anomaly_present))
  if (payload.anomaly_description) formData.append('anomaly_description', payload.anomaly_description)
  if (payload.anomaly_severity) formData.append('anomaly_severity', payload.anomaly_severity)

  if (payload.vehicle_condition) {
    formData.append('vehicle_condition', payload.vehicle_condition)
  }

  if (payload.cleanliness_state) {
    formData.append('cleanliness_state', payload.cleanliness_state)
  }

  if (payload.cleanliness_notes) {
    formData.append('cleanliness_notes', payload.cleanliness_notes)
  }

  payload.photos.forEach((photo) => {
    formData.append('photos', photo)
  })

  const { data } = await api.post<WorkerInterventionResponse>(`${getBasePath(role)}/${id}/check-in/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return data
}

export async function pauseIntervention(
  role: WorkerInterventionRole,
  id: number,
): Promise<WorkerInterventionResponse> {
  const { data } = await api.post<WorkerInterventionResponse>(`${getBasePath(role)}/${id}/pause/`, {})
  return data
}

export async function resumeIntervention(
  role: WorkerInterventionRole,
  id: number,
): Promise<WorkerInterventionResponse> {
  const { data } = await api.post<WorkerInterventionResponse>(`${getBasePath(role)}/${id}/resume/`, {})
  return data
}

export async function interruptIntervention(
  role: WorkerInterventionRole,
  id: number,
  payload: WorkerInterventionInterruptValues,
): Promise<WorkerInterventionResponse> {
  const formData = new FormData()
  formData.append('reason_type', payload.reason_type)
  if (payload.reason_detail) formData.append('reason_detail', payload.reason_detail)
  if (payload.photo) formData.append('photo', payload.photo)
  const { data } = await api.post<WorkerInterventionResponse>(`${getBasePath(role)}/${id}/interrupt/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
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

export async function saveInterventionWork(
  role: WorkerInterventionRole,
  id: number,
  payload: WorkerInterventionWorkValues,
): Promise<WorkerInterventionResponse> {
  const { data } = await api.post<WorkerInterventionResponse>(`${getBasePath(role)}/${id}/work/`, payload)
  return data
}

export async function checkOutIntervention(
  role: WorkerInterventionRole,
  id: number,
  payload: WorkerInterventionCheckOutValues,
): Promise<WorkerInterventionResponse> {
  const formData = new FormData()
  formData.append('final_mileage', String(payload.final_mileage))
  formData.append('final_energy_level_percent', String(payload.final_energy_level_percent))
  formData.append('anomaly_present', String(payload.anomaly_present))
  if (payload.anomaly_description) formData.append('anomaly_description', payload.anomaly_description)
  if (payload.anomaly_severity) formData.append('anomaly_severity', payload.anomaly_severity)
  payload.photos.forEach((photo) => formData.append('photos', photo))
  const { data } = await api.post<WorkerInterventionResponse>(`${getBasePath(role)}/${id}/check-out/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
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
