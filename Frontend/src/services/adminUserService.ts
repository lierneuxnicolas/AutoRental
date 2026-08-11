import api from './api'
import type {
  AdminUserListItem,
  AdminUserListQueryParams,
  AdminUserStatusUpdateRequest,
  PaginatedAdminUserListResponse,
} from '../types/adminUser'

export async function getAdminUsers(
  params?: AdminUserListQueryParams,
): Promise<PaginatedAdminUserListResponse> {
  const { data } = await api.get<PaginatedAdminUserListResponse>('/admin/users/', { params })
  return data
}

export async function updateAdminUserStatus(
  id: number | string,
  isActive: boolean,
): Promise<AdminUserListItem> {
  const payload: AdminUserStatusUpdateRequest = { is_active: isActive }
  const { data } = await api.patch<AdminUserListItem>(`/admin/users/${id}/status/`, payload)
  return data
}
