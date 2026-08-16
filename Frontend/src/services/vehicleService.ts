import api from './api'
import type { PaginatedResponse, PublicVehicle, VehiclesApiResponse } from '../types/vehicle'
import type { PriceSimulationRequest, PriceSimulationResponse } from '../types/simulation'
import type { VehicleManagementStatus } from '../types/managementVehicle'

export interface GetVehiclesParams {
  page?: number
  search?: string
  ordering?: string
  status?: VehicleManagementStatus
}

export interface GetAvailableVehiclesParams {
  start?: string
  end?: string
  page?: number
}

export async function getVehicles(params?: GetVehiclesParams): Promise<VehiclesApiResponse> {
  const { data } = await api.get<VehiclesApiResponse>('/vehicles/', {
    params,
  })

  return data
}

export async function getAvailableVehicles(params?: GetAvailableVehiclesParams): Promise<PaginatedResponse<PublicVehicle>> {
  const { data } = await api.get<PaginatedResponse<PublicVehicle>>('/vehicles/available/', {
    params,
  })

  return data
}

export async function getVehicleById(id: number | string): Promise<PublicVehicle> {
  const { data } = await api.get<PublicVehicle>(`/vehicles/${id}/`)
  return data
}

export async function simulatePrice(payload: PriceSimulationRequest): Promise<PriceSimulationResponse> {
  const { data } = await api.post<PriceSimulationResponse>('/simulations/', payload)
  return data
}