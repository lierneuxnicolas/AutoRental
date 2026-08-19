import { AxiosHeaders } from 'axios'
import api from './api'
import type {
  CompleteInspectionRequest,
  CreateInspectionResponse,
  DepartureVehicleStateRequest,
  DepartureVehicleStateResponse,
  Inspection,
  InspectionDamage,
  InspectionDamageCreateRequest,
  InspectionPhoto,
  LockVehicleResponse,
  UnlockVehicleResponse,
  UploadInspectionPhotoRequest,
} from '../types/inspection'

export async function createDepartureInspection(
  reservationId: number | string,
): Promise<CreateInspectionResponse> {
  const { data } = await api.post<CreateInspectionResponse>(`/reservations/${reservationId}/inspections/departure/`)
  return data
}

export async function createReturnInspection(
  reservationId: number | string,
): Promise<CreateInspectionResponse> {
  const { data } = await api.post<CreateInspectionResponse>(`/reservations/${reservationId}/inspections/return/`)
  return data
}

export async function completeInspection(
  inspectionId: number | string,
  payload: CompleteInspectionRequest,
): Promise<Inspection> {
  const { data } = await api.post<Inspection>(`/inspections/${inspectionId}/complete/`, payload)
  return data
}

export async function uploadInspectionPhoto(
  inspectionId: number | string,
  payload: UploadInspectionPhotoRequest,
): Promise<InspectionPhoto> {
  const formData = new FormData()
  formData.append('file', payload.file)
  formData.append('photo_type', payload.photo_type)

  if (payload.position !== undefined) {
    formData.append('position', String(payload.position))
  }

  const headers = new AxiosHeaders()
  headers.delete('Content-Type')

  const { data } = await api.post<InspectionPhoto>(`/inspections/${inspectionId}/photos/`, formData, {
    headers,
    timeout: 120000,
  })
  return data
}

export async function addInspectionDamage(
  inspectionId: number | string,
  payload: InspectionDamageCreateRequest,
): Promise<InspectionDamage> {
  const { data } = await api.post<InspectionDamage>(`/inspections/${inspectionId}/damages/`, payload)
  return data
}

export async function saveDepartureVehicleState(
  inspectionId: number | string,
  payload: DepartureVehicleStateRequest,
): Promise<DepartureVehicleStateResponse> {
  const { data } = await api.post<DepartureVehicleStateResponse>(`/inspections/${inspectionId}/vehicle-state/`, payload)
  return data
}

export async function unlockVehicle(
  reservationId: number | string,
): Promise<UnlockVehicleResponse> {
  const { data } = await api.post<UnlockVehicleResponse>(`/reservations/${reservationId}/unlock/`)
  return data
}

export async function lockVehicle(
  reservationId: number | string,
): Promise<LockVehicleResponse> {
  const { data } = await api.post<LockVehicleResponse>(`/reservations/${reservationId}/lock/`)
  return data
}
