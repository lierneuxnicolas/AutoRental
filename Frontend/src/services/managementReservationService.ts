import api from './api'
import type {
  ManagementReservationIssueRequest,
  ManagementReservationIssueResponse,
  ManagementReservationListQueryParams,
  ManagementReservationValidationRequest,
  ManagementReservationValidationResponse,
  PaginatedManagementReservationListResponse,
  ReservationManagementDetail,
  ReservationReassignmentResponse,
  ReservationReplacementVehicle,
  ReservationUnavailableCancellationResponse,
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

export async function getReservationReplacementVehicles(
  id: number | string,
): Promise<ReservationReplacementVehicle[]> {
  const { data } = await api.get<ReservationReplacementVehicle[]>(
    `/management/reservations/${id}/replacement-vehicles/`,
  )
  return data
}

export async function reassignManagementReservation(
  id: number | string,
  vehicleId: number,
): Promise<ReservationReassignmentResponse> {
  const { data } = await api.post<ReservationReassignmentResponse>(
    `/management/reservations/${id}/reassign/`,
    { vehicle_id: vehicleId },
  )
  return data
}

export async function cancelUnavailableManagementReservation(
  id: number | string,
): Promise<ReservationUnavailableCancellationResponse> {
  const { data } = await api.post<ReservationUnavailableCancellationResponse>(
    `/management/reservations/${id}/cancel-unavailable/`,
  )
  return data
}

export async function cancelVehicleUnavailableManagementReservation(
  id: number | string,
): Promise<ReservationUnavailableCancellationResponse> {
  const { data } = await api.post<ReservationUnavailableCancellationResponse>(
    `/management/reservations/${id}/cancel-vehicle-unavailable/`,
  )
  return data
}

export async function validateManagementReservationReturn(
  id: number | string,
  payload: ManagementReservationValidationRequest = {},
): Promise<ManagementReservationValidationResponse> {
  const { data } = await api.post<ManagementReservationValidationResponse>(
    `/management/reservations/${id}/complete/`,
    payload,
  )
  return data
}

export async function reportManagementReservationIssue(
  id: number | string,
  payload: ManagementReservationIssueRequest,
): Promise<ManagementReservationIssueResponse> {
  const formData = new FormData()
  formData.append('anomaly_type', payload.anomaly_type)
  formData.append('vehicle_status', payload.vehicle_status)
  formData.append('comment', payload.comment ?? '')

  for (const file of payload.evidence_files ?? []) {
    formData.append('evidence_files', file)
  }

  const { data } = await api.post<ManagementReservationIssueResponse>(
    `/management/reservations/${id}/report-issue/`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    },
  )
  return data
}
