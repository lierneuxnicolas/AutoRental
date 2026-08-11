import api from './api'
import type { PaginatedSystemLogListResponse, SystemLogListQueryParams } from '../types/systemLog'

export async function getSystemLogs(
  params?: SystemLogListQueryParams,
): Promise<PaginatedSystemLogListResponse> {
  const { data } = await api.get<PaginatedSystemLogListResponse>('/admin/system-logs/', { params })
  return data
}
