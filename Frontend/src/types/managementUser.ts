export type ManagementUserRole =
  | 'CLIENT'
  | 'GESTIONNAIRE_COMPTABLE'
  | 'ADMINISTRATEUR'
  | 'MECANICIEN'
  | 'NETTOYEUR'

export interface ManagementUserListItem {
  id: number
  email: string
  first_name: string
  last_name: string
  role: ManagementUserRole | null
  is_active: boolean
  date_joined: string
}

export interface ManagementUserDetail extends ManagementUserListItem {
  phone: string
  date_of_birth: string | null
}

export interface PaginatedManagementUserListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ManagementUserListItem[]
}
