export type SystemLogLevel = 'INFO' | 'WARNING' | 'ERROR'

export interface SystemLogUser {
  id: number
  email: string
  first_name: string
  last_name: string
}

export interface SystemLog {
  id: number
  user: SystemLogUser | null
  action: string
  message: string
  level: SystemLogLevel
  ip_address: string | null
  created_at: string
}

export interface PaginatedSystemLogListResponse {
  count: number
  next: string | null
  previous: string | null
  results: SystemLog[]
}

export type SystemLogOrdering = 'created_at' | '-created_at'

export interface SystemLogListQueryParams {
  page?: number
  search?: string
  level?: SystemLogLevel
  user?: number
  ordering?: SystemLogOrdering
}
