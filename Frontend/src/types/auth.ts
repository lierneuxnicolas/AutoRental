export interface AuthUser {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
  email_verified: boolean
}

export interface AuthTokens {
  access: string
  refresh: string
}

export interface AuthResponse extends AuthTokens {
  user: AuthUser
}

export interface LoginCredentials {
  email: string
  password: string
}
