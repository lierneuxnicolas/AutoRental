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
