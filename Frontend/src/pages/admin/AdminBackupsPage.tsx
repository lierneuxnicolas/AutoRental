import { useState } from 'react'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { createBackup, downloadBackup, getBackups } from '../../services/backupService'
import type { BackupRecord, BackupStatus } from '../../types/backup'

function toErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur est survenue. Veuillez reessayer.'
  }

  const payload = error.response?.data as
    | {
      detail?: string
      message?: string
      error_message?: string
    }
    | undefined

  if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  if (typeof payload?.error_message === 'string' && payload.error_message.trim().length > 0) {
    return payload.error_message
  }

  return 'Une erreur est survenue. Veuillez reessayer.'
}

async function toActionErrorMessage(error: unknown): Promise<string> {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur est survenue. Veuillez reessayer.'
  }

  const payload = error.response?.data
  if (payload instanceof Blob) {
    const textContent = await payload.text()
    try {
      const jsonPayload = JSON.parse(textContent) as {
        detail?: string
        message?: string
      }
      if (typeof jsonPayload.detail === 'string' && jsonPayload.detail.trim().length > 0) {
        return jsonPayload.detail
      }
      if (typeof jsonPayload.message === 'string' && jsonPayload.message.trim().length > 0) {
        return jsonPayload.message
      }
    } catch {
      if (textContent.trim().length > 0) {
        return textContent
      }
    }
  }

  return toErrorMessage(error)
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes < 0) {
    return '—'
  }

  if (bytes < 1024) {
    return `${bytes} o`
  }

  const units = ['Ko', 'Mo', 'Go', 'To']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`
}

function mapStatusToBadge(status: BackupStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'EN_COURS':
      return { label: 'EN_COURS', variant: 'warning' }
    case 'REUSSIE':
      return { label: 'REUSSIE', variant: 'success' }
    case 'ECHEC':
      return { label: 'ECHEC', variant: 'danger' }
    default:
      return { label: status, variant: 'neutral' }
  }
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const downloadUrl = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = downloadUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(downloadUrl)
}

interface BackupRecordCardProps {
  record: BackupRecord
  isDownloading: boolean
  onDownload: (record: BackupRecord) => void
}

function BackupRecordCard({ record, isDownloading, onDownload }: BackupRecordCardProps) {
  const statusPresentation = mapStatusToBadge(record.status)

  return (
    <Card
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Sauvegarde</p>
            <p className="text-base font-semibold text-[#0F172A]">{record.filename}</p>
          </div>
          <StatusBadge variant={statusPresentation.variant} label={statusPresentation.label} />
        </div>
      }
    >
      <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-6">
        <div>
          <p className="font-medium text-[#1F2937]">Date</p>
          <p className="mt-1">{formatDateTime(record.created_at)}</p>
        </div>
        <div>
          <p className="font-medium text-[#1F2937]">Nom du fichier</p>
          <p className="mt-1 break-all">{record.filename}</p>
        </div>
        <div>
          <p className="font-medium text-[#1F2937]">Type</p>
          <p className="mt-1">{record.backup_type}</p>
        </div>
        <div>
          <p className="font-medium text-[#1F2937]">Statut</p>
          <p className="mt-1">{record.status}</p>
        </div>
        <div>
          <p className="font-medium text-[#1F2937]">Taille</p>
          <p className="mt-1">{formatFileSize(record.file_size)}</p>
        </div>
        <div>
          <p className="font-medium text-[#1F2937]">Date de fin</p>
          <p className="mt-1">{formatDateTime(record.completed_at)}</p>
        </div>

        {record.status === 'ECHEC' && record.error_message ? (
          <div className="md:col-span-2 lg:col-span-6">
            <Alert
              variant="danger"
              title="Erreur de sauvegarde"
              message={record.error_message}
            />
          </div>
        ) : null}

        {record.status === 'REUSSIE' ? (
          <div className="md:col-span-2 lg:col-span-6 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onDownload(record)
              }}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <>
                  <LoadingSpinner size="sm" aria-label="Telechargement en cours" />
                  <span>Téléchargement...</span>
                </>
              ) : (
                'Télécharger'
              )}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export default function AdminBackupsPage() {
  const [page, setPage] = useState(1)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const backupsQuery = useQuery({
    queryKey: ['admin-backups', page],
    queryFn: () => getBackups({ page }),
  })

  const createBackupMutation = useMutation({
    mutationFn: createBackup,
    onMutate: () => {
      setActionError(null)
      setSuccessMessage(null)
    },
    onSuccess: async () => {
      setSuccessMessage('La sauvegarde a ete lancee avec succes.')
      await queryClient.invalidateQueries({ queryKey: ['admin-backups'] })
    },
    onError: (error: unknown) => {
      setActionError(toErrorMessage(error))
    },
  })

  const downloadBackupMutation = useMutation({
    mutationFn: async (record: BackupRecord) => {
      const blob = await downloadBackup(record.id)
      return { blob, filename: record.filename }
    },
    onMutate: () => {
      setActionError(null)
      setSuccessMessage(null)
    },
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename)
      setSuccessMessage('Le téléchargement a démarré.')
    },
    onError: (error: unknown) => {
      void (async () => {
        const message = await toActionErrorMessage(error)
        setActionError(message)
      })()
    },
  })

  const backups = backupsQuery.data?.results ?? []

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Administration</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Sauvegardes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Gérez les sauvegardes de la base de données AutoRental.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => {
            void createBackupMutation.mutateAsync()
          }}
          disabled={createBackupMutation.isPending}
          className="min-w-[210px]"
        >
          {createBackupMutation.isPending ? (
            <>
              <LoadingSpinner size="sm" aria-label="Creation de la sauvegarde" />
              <span>Creation...</span>
            </>
          ) : (
            'Créer une sauvegarde'
          )}
        </Button>
      </div>

      {successMessage ? (
        <Alert
          variant="success"
          title="Operation reussie"
          message={successMessage}
          className="mb-6"
        />
      ) : null}

      {actionError ? (
        <Alert
          variant="danger"
          title="Creation impossible"
          message={actionError}
          className="mb-6"
        />
      ) : null}

      {backupsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des sauvegardes" />
        </div>
      ) : null}

      {backupsQuery.isError ? (
        <Alert
          variant="danger"
          title="Chargement impossible"
          message={toErrorMessage(backupsQuery.error)}
          className="mb-6"
        />
      ) : null}

      {!backupsQuery.isLoading && !backupsQuery.isError && backups.length === 0 ? (
        <EmptyState
          title="Aucune sauvegarde"
          description="Aucune sauvegarde n’a encore été créée."
        />
      ) : null}

      {!backupsQuery.isLoading && !backupsQuery.isError && backups.length > 0 ? (
        <div className="space-y-4">
          {backups.map((record) => (
            <BackupRecordCard
              key={record.id}
              record={record}
              isDownloading={downloadBackupMutation.isPending && downloadBackupMutation.variables?.id === record.id}
              onDownload={(currentRecord) => {
                void downloadBackupMutation.mutateAsync(currentRecord)
              }}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
            <p className="text-sm text-slate-600">
              Page actuelle: <span className="font-semibold text-[#1F2937]">{page}</span>
              {' · '}
              Total: <span className="font-semibold text-[#1F2937]">{backupsQuery.data?.count ?? 0}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1))
                }}
                disabled={!backupsQuery.data?.previous}
              >
                Precedent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPage((current) => current + 1)
                }}
                disabled={!backupsQuery.data?.next}
              >
                Suivant
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
