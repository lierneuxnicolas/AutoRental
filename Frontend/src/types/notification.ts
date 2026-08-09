export interface Notification {
  id: number
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  read_at: string | null
  related_object_type: string | null
  related_object_id: number | null
}

export interface NotificationListQueryParams {
  created_at_after?: string
  created_at_before?: string
  is_read?: boolean
  notification_type?: string
  ordering?: string
  page?: number
}

export interface PaginatedNotificationListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Notification[]
}

export interface NotificationReadResponse {
  message: string
  notification: Notification
}

export interface NotificationReadAllResponse {
  message: string
  updated_count: number
}

export interface NotificationUnreadCountResponse {
  unread_count: number
}
