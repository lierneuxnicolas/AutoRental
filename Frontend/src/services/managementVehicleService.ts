import api from './api'
import type {
  ManagementVehicleDetailResponse,
  ManagementVehicleResponse,
  VehicleManagementCreateRequest,
  VehicleManagementStatusUpdateRequest,
  VehicleManagementUpdateRequest,
  VehiclePhotoCreateRequest,
  VehiclePhotoRead,
} from '../types/managementVehicle'

export async function createVehicle(
  payload: VehicleManagementCreateRequest,
): Promise<ManagementVehicleResponse> {
  const { data } = await api.post<ManagementVehicleResponse>('/management/vehicles/', payload)
  return data
}

export async function getManagementVehicleById(
  id: number | string,
): Promise<ManagementVehicleDetailResponse> {
  const { data } = await api.get<ManagementVehicleDetailResponse>(`/management/vehicles/${id}/`)
  return data
}

export async function updateVehicle(
  id: number,
  payload: VehicleManagementUpdateRequest,
): Promise<ManagementVehicleResponse> {
  const { data } = await api.patch<ManagementVehicleResponse>(`/management/vehicles/${id}/`, payload)
  return data
}

export async function uploadVehiclePhoto(
  id: number,
  payload: VehiclePhotoCreateRequest,
): Promise<VehiclePhotoRead> {
  const formData = new FormData()
  formData.append('file', payload.file)

  if (payload.is_primary !== undefined) {
    formData.append('is_primary', String(payload.is_primary))
  }

  if (payload.position !== undefined) {
    formData.append('position', String(payload.position))
  }

  if (payload.caption !== undefined) {
    formData.append('caption', payload.caption)
  }

  const { data } = await api.post<VehiclePhotoRead>(`/management/vehicles/${id}/photos/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return data
}

export async function deleteVehiclePhoto(vehicleId: number, photoId: number): Promise<void> {
  await api.delete(`/management/vehicles/${vehicleId}/photos/${photoId}/`)
}

export async function updateVehicleStatus(
  id: number,
  payload: VehicleManagementStatusUpdateRequest,
): Promise<ManagementVehicleResponse> {
  const { data } = await api.patch<ManagementVehicleResponse>(`/management/vehicles/${id}/status/`, payload)
  return data
}
