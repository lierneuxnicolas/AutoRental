export type DocumentType = 'CARTE_IDENTITE' | 'PERMIS_CONDUIRE'

export type DocumentStatus = 'EN_ATTENTE' | 'VALIDE' | 'REFUSE' | 'EXPIRE'
export type DrivingLicenseCategory =
  | 'AM' | 'A1' | 'A2' | 'A' | 'B' | 'BE' | 'C1' | 'C1E' | 'C' | 'CE' | 'D1' | 'D1E' | 'D' | 'DE'
export type DrivingLicenseTransmission = 'MANUAL_AND_AUTOMATIC' | 'AUTOMATIC_ONLY'

export interface ManagerClientDocumentList {
  id: number
  client: number
  client_email: string
  client_first_name: string
  client_last_name: string
  document_type: DocumentType
  document_number: string
  expiration_date: string | null
  driving_license_transmission: DrivingLicenseTransmission | null
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
  client_profile_status: string
  document_type: DocumentType
  document_number: string
  file: string | null
  expiration_date: string | null
  verified_date_of_birth: string | null
  driving_license_category: DrivingLicenseCategory | null
  driving_license_transmission: DrivingLicenseTransmission | null
  driving_license_transmission_declared: DrivingLicenseTransmission | null
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

export interface ManagerValidateDocumentRequest {
  first_name?: string
  last_name?: string
  document_number: string
  expiration_date: string
  driving_license_transmission?: DrivingLicenseTransmission
  verified_date_of_birth?: string
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
