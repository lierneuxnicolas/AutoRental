import api from './api'
import type {
  ManagementReservationIssueRequest,
  ManagementReservationIssueResponse,
  ManagementReservationListQueryParams,
  ManagementReservationValidationRequest,
  ManagementReservationValidationResponse,
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
