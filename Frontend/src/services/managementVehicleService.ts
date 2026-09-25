import api from './api'
import type {
  BrandOption,
  ManagementVehicleDetailResponse,
  ManagementVehicleListItem,
  ManagementVehicleResponse,
  ParkingSpaceOption,
  VehicleCategoryOption,
  VehicleEquipmentOption,
  VehicleInitialStateDraft,
  VehicleManagementCreateRequest,
  VehicleManagementStatusUpdateRequest,
  VehicleManagementUpdateRequest,
  VehiclePhotoCreateRequest,
  VehiclePhotoRead,
} from '../types/managementVehicle'
import type { PaginatedResponse } from '../types/vehicle'

export async function getBrands(): Promise<BrandOption[]> {
  const { data } = await api.get<BrandOption[]>('/brands/')
  return data
}

export async function getVehicleCategoryOptions(): Promise<VehicleCategoryOption[]> {
  const { data } = await api.get<VehicleCategoryOption[]>('/vehicle-categories/')
  return data
}

export async function getParkingSpaceOptions(): Promise<ParkingSpaceOption[]> {
  const { data } = await api.get<ParkingSpaceOption[]>('/parking-spaces/')
  return data
}

export async function getVehicleEquipmentCatalog(): Promise<VehicleEquipmentOption[]> {
  const { data } = await api.get<VehicleEquipmentOption[]>('/vehicle-equipment/')
  return data
}

export async function createVehicle(
  payload: VehicleManagementCreateRequest,
  initialState: VehicleInitialStateDraft,
): Promise<ManagementVehicleResponse> {
  const formData = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(key, String(item)))
      return
    }
    formData.append(key, String(value))
  })

  formData.append('initial_energy_level_percent', initialState.energyLevelPercent)
  Object.entries(initialState.photos).forEach(([key, file]) => {
    if (file) {
      formData.append(key, file)
    }
  })

  const damagePayload: Array<{ description: string; severity: string; photo_index?: number }> = []
  if (initialState.damage) {
    const item: { description: string; severity: string; photo_index?: number } = {
      description: initialState.damage.description.trim(),
      severity: initialState.damage.severity,
    }
    if (initialState.damage.photo) {
      item.photo_index = 0
      formData.append('initial_damage_photos', initialState.damage.photo)
    }
    damagePayload.push(item)
  }
  formData.append('initial_damages', JSON.stringify(damagePayload))

  const { data } = await api.post<ManagementVehicleResponse>('/management/vehicles/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getManagementVehicles(page = 1): Promise<PaginatedResponse<ManagementVehicleListItem>> {
  const { data } = await api.get<PaginatedResponse<ManagementVehicleListItem>>('/management/vehicles/', {
    params: { page },
  })
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
