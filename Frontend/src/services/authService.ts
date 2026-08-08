import api from './api'
import type { AuthResponse, AuthTokens, AuthUser, LoginCredentials } from '../types/auth'

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login/', credentials)
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
