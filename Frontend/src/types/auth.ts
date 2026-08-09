export interface AuthUser {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
  email_verified: boolean
}

export type ClientProfileStatus = 'INCOMPLET' | 'EN_ATTENTE' | 'EN_ATTENTE_VALIDATION' | 'VALIDE' | 'REFUSE' | 'EXPIRE'

export interface ClientProfileMe {
  id: number
  email: string
  first_name: string
  last_name: string
  phone: string
  email_verified: boolean
  role: string | null
  date_joined: string
  date_of_birth: string | null
  address: string
  profile_status: ClientProfileStatus
  rejection_reason: string
  created_at: string
  updated_at: string
}

export interface ClientProfileUpdateRequest {
  first_name: string
  last_name: string
  phone: string
  date_of_birth: string | null
  address: string
}

export interface ClientProfileProgress {
  percentage: number
  account_created: boolean
  email_verified: boolean
  personal_information_complete: boolean
  identity_card_valid: boolean
  driving_license_valid: boolean
}

export type ClientDocumentType = 'CARTE_IDENTITE' | 'PERMIS_CONDUIRE'
export type ClientDocumentStatus = 'EN_ATTENTE' | 'VALIDE' | 'REFUSE' | 'EXPIRE'

export interface ClientDocument {
  id: number
  document_type: ClientDocumentType
  document_number: string
  expiration_date: string | null
  status: ClientDocumentStatus
  rejection_reason: string
  uploaded_at: string
  validated_at: string | null
  is_active: boolean
  file: string | null
}

export interface ClientDocumentListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ClientDocument[]
}

export interface AuthTokens {
  access: string
  refresh?: string
}

export interface AuthResponse extends AuthTokens {
  refresh: string
  user: AuthUser
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterRequest {
  first_name: string
  last_name: string
  email: string
  password: string
  password_confirm: string
}

export interface RegisterResponse {
  message: string
  user: AuthUser
}

export interface VerifyEmailRequest {
  token: string
}

export interface VerifyEmailResponse {
  message: string
}

export interface PasswordResetRequest {
  email: string
}

export interface PasswordResetConfirmRequest {
  uid: string
  token: string
  new_password: string
  new_password_confirm: string
}
