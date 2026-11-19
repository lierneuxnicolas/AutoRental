import api from './api'
import type {
  ManagementUserDetail,
  ManagementUserListItem,
  PaginatedManagementUserListResponse,
} from '../types/managementUser'

export async function getManagementUsers(page = 1): Promise<PaginatedManagementUserListResponse> {
  const { data } = await api.get<PaginatedManagementUserListResponse>('/management/users/', {
    params: { page },
  })
  return data
}

export async function getManagementUser(id: number): Promise<ManagementUserDetail> {
  const { data } = await api.get<ManagementUserDetail>(`/management/users/${id}/`)
  return data
}

export async function updateManagementUserStatus(
  id: number,
  isActive: boolean,
): Promise<ManagementUserListItem> {
  const { data } = await api.patch<ManagementUserListItem>(`/management/users/${id}/status/`, {
    is_active: isActive,
  })
  return data
}
