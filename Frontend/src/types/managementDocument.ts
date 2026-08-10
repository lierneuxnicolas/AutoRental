export type DocumentType = 'CARTE_IDENTITE' | 'PERMIS_CONDUIRE'

export type DocumentStatus = 'EN_ATTENTE' | 'VALIDE' | 'REFUSE' | 'EXPIRE'

export interface ManagerClientDocumentList {
  id: number
  client: number
  client_email: string
  client_first_name: string
  client_last_name: string
  document_type: DocumentType
  document_number: string
  expiration_date: string | null
  status: DocumentStatus
  is_active: boolean
  uploaded_at: string
  validated_at: string | null
  validated_by_email: string | null
}

export interface ManagerClientDocumentDetail {
  id: number
  client: number
  client_email: string
  client_first_name: string
  client_last_name: string
  document_type: DocumentType
  document_number: string
  file: string | null
  expiration_date: string | null
  status: DocumentStatus
  rejection_reason: string
  uploaded_at: string
  validated_at: string | null
  validated_by: number | null
  validated_by_email: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ManagerRejectDocumentRequest {
  reason: string
}

export interface PaginatedManagerClientDocumentListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ManagerClientDocumentList[]
}

export interface ManagementDocumentListQueryParams {
  ordering?: string
  page?: number
  search?: string
}
