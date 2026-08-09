import api from './api'
import type {
  NotificationListQueryParams,
  NotificationReadAllResponse,
  NotificationReadResponse,
  NotificationUnreadCountResponse,
  PaginatedNotificationListResponse,
} from '../types/notification'

export async function getNotifications(
  params?: NotificationListQueryParams,
): Promise<PaginatedNotificationListResponse> {
  const { data } = await api.get<PaginatedNotificationListResponse>('/notifications/', { params })
  return data
}

export async function markNotificationAsRead(id: number | string): Promise<NotificationReadResponse> {
  const { data } = await api.post<NotificationReadResponse>(`/notifications/${id}/read/`)
  return data
}

export async function markAllNotificationsAsRead(): Promise<NotificationReadAllResponse> {
  const { data } = await api.post<NotificationReadAllResponse>('/notifications/read-all/')
  return data
}

export async function getUnreadNotificationCount(): Promise<NotificationUnreadCountResponse> {
  const { data } = await api.get<NotificationUnreadCountResponse>('/notifications/unread-count/')
  return data
}
