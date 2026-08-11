import api from './api'
import type {
  ManagementReservationClosureRequest,
  ManagementReservationClosureResponse,
  ManagementReservationListQueryParams,
  PaginatedManagementReservationListResponse,
  ReservationManagementDetail,
} from '../types/managementReservation'

export async function getManagementReservations(
  params?: ManagementReservationListQueryParams,
): Promise<PaginatedManagementReservationListResponse> {
  const { data } = await api.get<PaginatedManagementReservationListResponse>(
    '/management/reservations/',
    { params },
  )
  return data
}

export async function getManagementReservationById(
  id: number | string,
): Promise<ReservationManagementDetail> {
  const { data } = await api.get<ReservationManagementDetail>(`/management/reservations/${id}/`)
  return data
}

export async function completeManagementReservation(
  inspectionId: number | string,
  payload: ManagementReservationClosureRequest,
): Promise<ManagementReservationClosureResponse> {
  const { data } = await api.post<ManagementReservationClosureResponse>(
    `/inspections/${inspectionId}/complete/`,
    payload,
  )
  return data
}
