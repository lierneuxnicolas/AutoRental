import api from './api'
import type {
  ManagementDocumentListQueryParams,
  ManagerClientDocumentDetail,
  ManagerRejectDocumentRequest,
  PaginatedManagerClientDocumentListResponse,
} from '../types/managementDocument'

export async function getManagementDocuments(
  params?: ManagementDocumentListQueryParams,
): Promise<PaginatedManagerClientDocumentListResponse> {
  const { data } = await api.get<PaginatedManagerClientDocumentListResponse>(
    '/management/documents/',
    { params },
  )
  return data
}

export async function getManagementDocumentById(id: number): Promise<ManagerClientDocumentDetail> {
  const { data } = await api.get<ManagerClientDocumentDetail>(`/management/documents/${id}/`)
  return data
}

export async function validateManagementDocument(id: number): Promise<ManagerClientDocumentDetail> {
  const { data } = await api.post<ManagerClientDocumentDetail>(
    `/management/documents/${id}/validate/`,
  )
  return data
}

export async function rejectManagementDocument(
  id: number,
  payload: ManagerRejectDocumentRequest,
): Promise<ManagerClientDocumentDetail> {
  const { data } = await api.post<ManagerClientDocumentDetail>(
    `/management/documents/${id}/reject/`,
    payload,
  )
  return data
}
