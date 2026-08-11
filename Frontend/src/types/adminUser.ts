export type AdminUserRoleCode =
  | 'CLIENT'
  | 'GESTIONNAIRE_COMPTABLE'
  | 'ADMINISTRATEUR'
  | 'MECANICIEN'
  | 'NETTOYEUR'

export interface AdminUserListItem {
  id: number
  email: string
  first_name: string
  last_name: string
  phone: string
  role: AdminUserRoleCode | null
  email_verified: boolean
  is_active: boolean
  date_joined: string
  last_login: string | null
}

export interface PaginatedAdminUserListResponse {
  count: number
  next: string | null
  previous: string | null
  results: AdminUserListItem[]
}

export type AdminUserOrdering =
  | 'date_joined'
  | '-date_joined'
  | 'email'
  | '-email'
  | 'last_login'
  | '-last_login'

export interface AdminUserListQueryParams {
  page?: number
  search?: string
  role?: AdminUserRoleCode
  is_active?: boolean
  email_verified?: boolean
  ordering?: AdminUserOrdering
}

export interface AdminUserStatusUpdateRequest {
  is_active: boolean
}
