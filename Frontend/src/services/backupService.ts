import api from './api'
import type { BackupListQueryParams, CreateBackupResponse, PaginatedBackupRecordResponse } from '../types/backup'

export async function getBackups(
  params?: BackupListQueryParams,
): Promise<PaginatedBackupRecordResponse> {
  const { data } = await api.get<PaginatedBackupRecordResponse>('/admin/backups/', { params })
  return data
}

export async function createBackup(): Promise<CreateBackupResponse> {
  const { data } = await api.post<CreateBackupResponse>('/admin/backups/create/', {})
  return data
}

export async function downloadBackup(id: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/admin/backups/${id}/download/`, {
    responseType: 'blob',
  })
  return data
}
