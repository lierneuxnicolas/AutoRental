import api from './api'
import type {
  AuthResponse,
  AuthTokens,
  AuthUser,
  ClientDocument,
  ClientDocumentListResponse,
  ClientProfileMe,
  ClientProfileProgress,
  ClientProfileUpdateRequest,
  LoginCredentials,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RegisterRequest,
  RegisterResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '../types/auth'

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login/', credentials)
  return data
}

export async function register(credentials: RegisterRequest): Promise<RegisterResponse> {
  const { data } = await api.post<RegisterResponse>('/auth/register/', credentials)
  return data
}

export async function verifyEmail(payload: VerifyEmailRequest): Promise<VerifyEmailResponse> {
  const { data } = await api.post<VerifyEmailResponse>('/auth/verify-email/', payload)
  return data
}

export async function requestPasswordReset(payload: PasswordResetRequest): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>('/auth/password-reset/', payload)
  return data
}

export async function resetPassword(payload: PasswordResetConfirmRequest): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>('/auth/password-reset/confirm/', payload)
  return data
}

export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me/')
  return data
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>('/auth/token/refresh/', { refresh: refreshToken })
  return data
}

export async function logout(refreshToken: string): Promise<void> {
  await api.post('/auth/logout/', { refresh: refreshToken })
}

export async function getClientProfileMe(): Promise<ClientProfileMe> {
  const { data } = await api.get<ClientProfileMe>('/users/me/')
  return data
}

export async function getClientProfileProgress(): Promise<ClientProfileProgress> {
  const { data } = await api.get<ClientProfileProgress>('/users/me/profile-progress/')
  return data
}

export async function updateClientProfile(payload: ClientProfileUpdateRequest): Promise<ClientProfileMe> {
  const { data } = await api.patch<ClientProfileMe>('/users/me/', payload)
  return data
}

export async function getClientDocuments(): Promise<ClientDocumentListResponse> {
  const { data } = await api.get<ClientDocumentListResponse>('/users/me/documents/')
  return data
}

export async function createClientDocument(formData: FormData): Promise<ClientDocument> {
  const { data } = await api.post<ClientDocument>('/users/me/documents/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return data
}
