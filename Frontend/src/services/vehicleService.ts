import api from './api'
import type { PublicVehicle, VehiclesApiResponse } from '../types/vehicle'

export interface GetVehiclesParams {
  page?: number
  search?: string
  ordering?: string
}

export async function getVehicles(params?: GetVehiclesParams): Promise<VehiclesApiResponse> {
  const { data } = await api.get<VehiclesApiResponse>('/vehicles/', {
    params,
  })

  return data
}

export async function getVehicleById(id: number | string): Promise<PublicVehicle> {
  const { data } = await api.get<PublicVehicle>(`/vehicles/${id}/`)
  return data
}