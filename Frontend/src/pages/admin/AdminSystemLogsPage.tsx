import { professionalDisplay } from '../../i18n/professionalDisplay'
import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getSystemLogs } from '../../services/systemLogService'
import type { SystemLog, SystemLogLevel } from '../../types/systemLog'

function toErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur est survenue. Veuillez reessayer.'
  }

  const payload = error.response?.data as
    | {
      detail?: string
      message?: string
    }
    | undefined

  if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  return 'Une erreur est survenue. Veuillez reessayer.'
}

function formatDateTime(value: string): string {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString(clientLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function mapLevelToVariant(level: SystemLogLevel): StatusVariant {
  switch (level) {
    case 'INFO':
      return 'info'
    case 'WARNING':
      return 'warning'
    case 'ERROR':
      return 'danger'
    default:
      return 'neutral'
  }
}

function formatUser(log: SystemLog): string {
  if (!log.user) {
    return '—'
  }

  const fullName = `${log.user.first_name} ${log.user.last_name}`.trim()
  return fullName || log.user.email
}

export default function AdminSystemLogsPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)

  const logsQuery = useQuery({
    queryKey: ['admin-system-logs', page],
    queryFn: () => getSystemLogs({ page, ordering: '-created_at' }),
  })

  const logs = logsQuery.data?.results ?? []

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">{t("professional.administration")}</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">{t("professional.journaux_systeme")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {t("professional.consultez_les_evenements_importants_enregistres_par_la_plateforme")}</p>
      </div>

      {logsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label={t("professional.chargement_des_journaux_systeme")} />
        </div>
      ) : null}

      {logsQuery.isError ? (
        <Alert
          variant="danger"
          title={t("client.chargement_impossible")}
          message={professionalDisplay(t, toErrorMessage(logsQuery.error))}
          className="mb-6"
        />
      ) : null}

      {!logsQuery.isLoading && !logsQuery.isError && logs.length === 0 ? (
        <EmptyState
          title={t("professional.aucun_journal")}
          description={t("professional.aucun_evenement_systeme_n_est_actuellement_enregistre")}
        />
      ) : null}

      {!logsQuery.isLoading && !logsQuery.isError && logs.length > 0 ? (
        <div className="space-y-4">
          {logs.map((log) => (
            <Card
              key={log.id}
              header={
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("professional.evenement")}</p>
                    <p className="text-base font-semibold text-[#0F172A]">{formatDateTime(log.created_at)}</p>
                  </div>
                  <StatusBadge variant={mapLevelToVariant(log.level)} label={log.level} />
                </div>
              }
            >
              <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="font-medium text-[#1F2937]">{t("professional.date_et_heure")}</p>
                  <p className="mt-1">{formatDateTime(log.created_at)}</p>
                </div>
                <div>
                  <p className="font-medium text-[#1F2937]">{t("navigation.user")}</p>
                  <p className="mt-1">{formatUser(log)}</p>
                </div>
                <div>
                  <p className="font-medium text-[#1F2937]">{t("professional.action")}</p>
                  <p className="mt-1">{log.action}</p>
                </div>
                <div>
                  <p className="font-medium text-[#1F2937]">{t("professional.adresse_ip")}</p>
                  <p className="mt-1">{log.ip_address ?? '—'}</p>
                </div>
                <div className="md:col-span-2 lg:col-span-5">
                  <p className="font-medium text-[#1F2937]">{t("professional.message")}</p>
                  <p className="mt-1 whitespace-pre-wrap">{log.message}</p>
                </div>
              </div>
            </Card>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
            <p className="text-sm text-slate-600">
              {t("professional.page_actuelle")}<span className="font-semibold text-[#1F2937]">{page}</span>
              {' · '}
              {t("client.total")}<span className="font-semibold text-[#1F2937]">{logsQuery.data?.count ?? 0}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1))
                }}
                disabled={!logsQuery.data?.previous}
              >
                {t("client.precedent_alt")}</Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPage((current) => current + 1)
                }}
                disabled={!logsQuery.data?.next}
              >
                {t("client.suivant")}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
