import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge from '../../components/ui/StatusBadge'
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../../services/notificationService'
import type { Notification, NotificationListQueryParams } from '../../types/notification'

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getNotificationStatusLabel(notification: Notification): { label: string; variant: 'success' | 'warning' } {
  return notification.is_read
    ? { label: 'Lu', variant: 'success' }
    : { label: 'Non lu', variant: 'warning' }
}

export default function ClientNotificationsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)

  const notificationsQuery = useQuery({
    queryKey: ['client-notifications', page],
    queryFn: () => getNotifications({ page } satisfies NotificationListQueryParams),
  })

  const unreadCountQuery = useQuery({
    queryKey: ['client-notifications-count'],
    queryFn: getUnreadNotificationCount,
  })

  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => markNotificationAsRead(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['client-notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['client-notifications-count'] }),
      ])
    },
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['client-notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['client-notifications-count'] }),
      ])
    },
  })

  const notifications = useMemo(() => notificationsQuery.data?.results ?? [], [notificationsQuery.data?.results])
  const unreadCount = unreadCountQuery.data?.unread_count ?? 0

  const hasPreviousPage = Boolean(notificationsQuery.data?.previous)
  const hasNextPage = Boolean(notificationsQuery.data?.next)

  const handleMarkAllAsRead = () => {
    void markAllAsReadMutation.mutateAsync()
  }

  const handleMarkAsRead = (id: number) => {
    void markAsReadMutation.mutateAsync(id)
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#0F172A]">Notifications</h1>
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
          <p className="whitespace-nowrap text-sm font-semibold text-[#0F172A]">Non lu : {unreadCount}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleMarkAllAsRead}
          disabled={markAllAsReadMutation.isPending || unreadCount === 0}
        >
          {markAllAsReadMutation.isPending ? 'Traitement...' : 'Tout marquer comme lu'}
        </Button>
      </div>

      {notificationsQuery.isLoading || unreadCountQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des notifications" />
        </div>
      ) : null}

      {notificationsQuery.isError ? (
        <Alert
          variant="danger"
          title="Chargement impossible"
          message="Les notifications n'ont pas pu être récupérées. Veuillez réessayer."
          className="mb-6"
        />
      ) : null}

      {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 ? (
        <EmptyState
          title="Aucune notification"
          description="Vous n’avez aucune nouvelle notification."
        />
      ) : null}

      {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length > 0 ? (
        <div className="space-y-4">
          {notifications.map((notification) => {
            const status = getNotificationStatusLabel(notification)
            const isPending = markAsReadMutation.isPending && markAsReadMutation.variables === notification.id

            return (
              <Card
                key={notification.id}
                header={
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{formatDateTime(notification.created_at)}</p>
                      <p className="text-base font-semibold text-[#0F172A]">{notification.title}</p>
                    </div>
                    <StatusBadge variant={status.variant} label={status.label} />
                  </div>
                }
              >
                <div className="space-y-3">
                  {!notification.is_read ? (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="flex-1 text-sm leading-7 text-slate-700">{notification.message}</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleMarkAsRead(notification.id)}
                        disabled={isPending}
                      >
                        {isPending ? 'Mise à jour...' : 'Marquer comme lue'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm leading-7 text-slate-700">{notification.message}</p>
                  )}

                  {notification.read_at ? (
                    <div className="text-sm text-slate-500">
                      {`Lue le ${formatDateTime(notification.read_at)}`}
                    </div>
                  ) : null}
                </div>
              </Card>
            )
          })}

          <div className="flex items-center justify-between gap-4 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={!hasPreviousPage || page === 1}>
              Précédent
            </Button>
            <span className="text-sm text-slate-600">Page {page}</span>
            <Button variant="secondary" size="sm" onClick={() => setPage((current) => current + 1)} disabled={!hasNextPage}>
              Suivant
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
