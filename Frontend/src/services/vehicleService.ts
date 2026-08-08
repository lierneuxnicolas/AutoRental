import api from './api'
import type { VehiclesApiResponse } from '../types/vehicle'

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