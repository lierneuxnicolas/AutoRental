export type BackupStatus = 'EN_COURS' | 'REUSSIE' | 'ECHEC'

export type BackupType = 'DATABASE'

export interface BackupRecord {
  id: number
  filename: string
  backup_type: BackupType
  status: BackupStatus
  file_size: number | null
  created_at: string
  completed_at: string | null
  error_message: string | null
}

export interface PaginatedBackupRecordResponse {
  count: number
  next: string | null
  previous: string | null
  results: BackupRecord[]
}

export interface BackupListQueryParams {
  page?: number
}

export type CreateBackupResponse = BackupRecord
