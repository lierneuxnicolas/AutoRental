import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useSearchParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { cn } from '../../components/ui/cn'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getInvoiceById, getInvoiceDownload } from '../../services/invoiceService'
import {
  cancelReservation,
  getReservationCancellationPreview,
  getReservations,
} from '../../services/reservationService'
import type { ReservationDetail, ReservationListQueryParams, ReservationStatus } from '../../types/reservation'
import { getUnlockWindowAvailability, isReservationCancellable } from '../../utils/reservationActionRules'

// Shared sizing so every card action button lines up (height/radius already come from Button's "sm" size).
const actionButtonClassName = 'min-w-44 justify-center'

function mapStatusToUi(status: ReservationStatus | undefined): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'BROUILLON':
      return { label: 'Brouillon', variant: 'neutral' }
    case 'EN_ATTENTE_CAUTION':
      return { label: 'En attente caution', variant: 'warning' }
    case 'EN_ATTENTE_PAIEMENT':
      return { label: 'En attente paiement', variant: 'warning' }
    case 'CONFIRMEE':
      return { label: 'Confirmée', variant: 'success' }
    case 'REAFFECTATION_REQUIRED':
      return { label: 'À réaffecter', variant: 'warning' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'A_CONTROLER':
      return { label: 'A contrôler', variant: 'warning' }
    case 'TERMINEE':
      return { label: 'Terminée', variant: 'success' }
    case 'ANNULEE':
      return { label: 'Annulée', variant: 'danger' }
    case 'PAIEMENT_ECHOUE':
      return { label: 'Paiement échoué', variant: 'danger' }
    default:
      return { label: 'Inconnu', variant: 'neutral' }
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDateTimeOrDash(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  return formatDateTime(value)
}

function vehicleLabel(reservation: ReservationDetail): string {
  return `${reservation.vehicle.brand} ${reservation.vehicle.model_name}`
}

const DRAFT_HOLD_MINUTES = 15

function isDraftExpired(reservation: ReservationDetail): boolean {
  const createdAt = new Date(reservation.created_at).getTime()
  if (Number.isNaN(createdAt)) {
    return false
  }

  return Date.now() - createdAt >= DRAFT_HOLD_MINUTES * 60 * 1000
}

function canContinuePayment(reservation: ReservationDetail): boolean {
  const status = reservation.status
  if (status !== 'BROUILLON' && status !== 'EN_ATTENTE_CAUTION' && status !== 'EN_ATTENTE_PAIEMENT') {
    return false
  }

  // A BROUILLON older than the hold window is being (or about to be) auto-cancelled server-side.
  if (status === 'BROUILLON' && isDraftExpired(reservation)) {
    return false
  }

  return true
}

function buildInvoicePdfFilename(invoiceNumber: string): string {
  return `GetaCar_Facture_${invoiceNumber}.pdf`
}

function formatEuro(value: string | number): string {
  const numericValue = typeof value === 'number' ? value : Number(value)

  if (Number.isNaN(numericValue)) {
    return `${value} EUR`
  }

  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue)
}

async function toInvoiceDownloadErrorMessage(error: unknown): Promise<string> {
  const fallback = 'Le telechargement de la facture a echoue. Veuillez reessayer.'

  if (!axios.isAxiosError(error)) {
    return fallback
  }

  const data = error.response?.data

  // With responseType: 'blob', axios stores JSON error bodies as an opaque Blob instead of parsing them.
  if (data instanceof Blob) {
    try {
      const text = await data.text()
      const parsed = JSON.parse(text) as { detail?: string; message?: string }
      if (typeof parsed.detail === 'string' && parsed.detail.trim().length > 0) {
        return parsed.detail
      }
      if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
        return parsed.message
      }
    } catch {
      // Not a JSON body: fall through to the generic message below.
    }
  }

  return fallback
}

export default function ClientReservationsPage() {
  const [page, setPage] = useState(1)
  const [downloadingReservationId, setDownloadingReservationId] = useState<number | null>(null)
  const [invoiceDownloadError, setInvoiceDownloadError] = useState<string | null>(null)
  const [cancelingReservationId, setCancelingReservationId] = useState<number | null>(null)
  const [unlockHintReservationId, setUnlockHintReservationId] = useState<number | null>(null)
  const [searchParams] = useSearchParams()
  const highlightedReservationId = Number(searchParams.get('highlight'))
  const isHighlightValid = Number.isInteger(highlightedReservationId) && highlightedReservationId > 0
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const unlockHintTimeoutRef = useRef<number | null>(null)

  const showUnlockHint = (reservationId: number) => {
    setUnlockHintReservationId(reservationId)
    if (unlockHintTimeoutRef.current !== null) {
      window.clearTimeout(unlockHintTimeoutRef.current)
    }
    unlockHintTimeoutRef.current = window.setTimeout(() => {
      setUnlockHintReservationId(null)
    }, 3000)
  }

  useEffect(() => {
    return () => {
      if (unlockHintTimeoutRef.current !== null) {
        window.clearTimeout(unlockHintTimeoutRef.current)
      }
    }
  }, [])

  const queryParams: ReservationListQueryParams = {
    page,
    ordering: '-created_at',
  }

  const reservationsQuery = useQuery({
    queryKey: ['client-reservations', queryParams],
    queryFn: () => getReservations(queryParams),
  })

  const reservations = useMemo(() => reservationsQuery.data?.results ?? [], [reservationsQuery.data?.results])

  useEffect(() => {
    if (!isHighlightValid || reservations.length === 0) {
      return
    }

    const target = cardRefs.current.get(highlightedReservationId)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedReservationId, isHighlightValid, reservations])

  const cancellationPreviewQuery = useQuery({
    queryKey: ['reservation-cancel-preview', cancelingReservationId],
    queryFn: () => getReservationCancellationPreview(cancelingReservationId!),
    enabled: cancelingReservationId !== null,
  })

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelReservation(cancelingReservationId!, { reason: 'Annulation demandee par le client depuis l espace client.' }),
    onSuccess: async () => {
      setCancelingReservationId(null)
      await reservationsQuery.refetch()
    },
  })

  const handleInvoiceDownload = async (reservation: ReservationDetail) => {
    if (!reservation.invoice_id) {
      return
    }

    setInvoiceDownloadError(null)
    setDownloadingReservationId(reservation.id)
    try {
      const [invoice, pdfBlob] = await Promise.all([
        getInvoiceById(reservation.invoice_id),
        getInvoiceDownload(reservation.invoice_id),
      ])
      const objectUrl = URL.createObjectURL(pdfBlob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = buildInvoicePdfFilename(invoice.number)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      setInvoiceDownloadError(await toInvoiceDownloadErrorMessage(error))
    } finally {
      setDownloadingReservationId(null)
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-[#0F172A]">Mes réservations</h1>
      </div>

      {reservationsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des réservations" />
        </div>
      ) : null}

      {reservationsQuery.isError ? (
        <Alert
          variant="danger"
          title="Chargement impossible"
          message="Les réservations n'ont pas pu être récupérées. Veuillez réessayer."
          className="mb-6"
        />
      ) : null}

      {invoiceDownloadError ? (
        <Alert
          variant="danger"
          title="Téléchargement impossible"
          message={invoiceDownloadError}
          className="mb-6"
        />
      ) : null}

      {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length === 0 ? (
        <EmptyState
          title="Aucune réservation"
          description="Aucune réservation"
          action={
            <Link to="/vehicles">
              <Button>Rechercher un véhicule</Button>
            </Link>
          }
        />
      ) : null}

      {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length > 0 ? (
        <div className="space-y-4">
          {reservations.map((reservation) => {
            const status = mapStatusToUi(reservation.status)
            const unlockAvailability = getUnlockWindowAvailability(reservation.status, reservation.start_at, reservation.end_at)
            const showCancelButton = isReservationCancellable(reservation.status, reservation.start_at)
            const showReturnButton = reservation.status === 'EN_COURS'
            const isHighlighted = isHighlightValid && reservation.id === highlightedReservationId
            const invoiceButton = (
              <Button
                variant="secondary"
                size="sm"
                className={actionButtonClassName}
                onClick={() => void handleInvoiceDownload(reservation)}
                disabled={downloadingReservationId === reservation.id}
              >
                {downloadingReservationId === reservation.id ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Téléchargement en cours" />
                    Téléchargement...
                  </span>
                ) : (
                  'Télécharger la facture'
                )}
              </Button>
            )

            return (
              <div
                key={reservation.id}
                ref={(node) => {
                  if (node) {
                    cardRefs.current.set(reservation.id, node)
                  } else {
                    cardRefs.current.delete(reservation.id)
                  }
                }}
                className={isHighlighted ? 'rounded-3xl ring-2 ring-[#4F46E5] ring-offset-2 transition-all' : ''}
              >
              <Card
                className="[&>div:first-child]:px-5 [&>div:first-child]:py-3 [&>div:nth-child(2)]:px-5 [&>div:nth-child(2)]:py-4"
                header={
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                      <p className="whitespace-nowrap text-sm text-[#0F172A]">
                        <span className="font-semibold">Référence :</span> {reservation.reference}
                      </p>
                      <p className="whitespace-nowrap text-sm text-[#0F172A]">
                        <span className="font-semibold">Date de création :</span> {formatDateTime(reservation.created_at)}
                      </p>
                    </div>
                    <StatusBadge variant={status.variant} label={status.label} />
                  </div>
                }
              >
                <div className="grid gap-x-6 gap-y-5 text-sm text-slate-700 lg:grid-cols-3">
                  <div className="space-y-4">
                    <div>
                      <p className="font-medium text-[#1F2937]">Véhicule</p>
                      <p>{vehicleLabel(reservation)}</p>
                      <p className="text-xs text-slate-500">{reservation.vehicle.registration_number}</p>
                    </div>
                    <div>
                      <p className="font-medium text-[#1F2937]">Période prévue</p>
                      <p>Début : {formatDateTime(reservation.start_at)}</p>
                      <p>Fin : {formatDateTime(reservation.end_at)}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="font-medium text-[#1F2937]">Localisation</p>
                      <p>{reservation.vehicle.parking_name}</p>
                      <p className="text-xs text-slate-500">Place {reservation.vehicle.parking_space_number}</p>
                    </div>
                    <div>
                      <p className="font-medium text-[#1F2937]">Utilisation réelle</p>
                      <p>Prise en charge : {formatDateTimeOrDash(reservation.actual_pickup_at)}</p>
                      <p>Retour : {formatDateTimeOrDash(reservation.actual_return_at)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Paiement</p>
                    <p>Montant : {reservation.rental_amount} EUR</p>
                    <p>Caution : {reservation.deposit_amount} EUR</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 items-center gap-3 sm:grid-cols-3">
                  <div className="flex justify-center sm:justify-start">
                    {reservation.invoice_id ? invoiceButton : null}
                  </div>

                  <div className="flex justify-center">
                    {canContinuePayment(reservation) ? (
                      <Link to={`/payment?reservationId=${reservation.id}`}>
                        <Button size="sm" className={actionButtonClassName}>Continuer le paiement</Button>
                      </Link>
                    ) : null}
                    {unlockAvailability.isVisible ? (
                      <div className="relative inline-flex">
                        {unlockAvailability.isEnabled ? (
                          <Link to={`/client/reservations/${reservation.id}/unlock`}>
                            <Button size="sm" className={actionButtonClassName}>Déverrouiller le véhicule</Button>
                          </Link>
                        ) : (
                          <Button
                            size="sm"
                            aria-disabled="true"
                            className={cn(actionButtonClassName, 'opacity-50 hover:opacity-50')}
                            onClick={() => showUnlockHint(reservation.id)}
                          >
                            Déverrouiller le véhicule
                          </Button>
                        )}
                        {unlockHintReservationId === reservation.id ? (
                          <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                            Disponible 15 min avant le départ
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {showReturnButton ? (
                      <Link to={`/client/reservations/${reservation.id}/return-inspection`}>
                        <Button size="sm" variant="success" className={actionButtonClassName}>
                          Restituer le véhicule
                        </Button>
                      </Link>
                    ) : null}
                  </div>

                  <div className="flex justify-center sm:justify-end">
                    {showCancelButton ? (
                      <Button variant="danger" size="sm" className={actionButtonClassName} onClick={() => setCancelingReservationId(reservation.id)}>
                        Annuler ma réservation
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
              </div>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
            <p className="text-sm text-slate-600">
              Total: <span className="font-semibold text-[#1F2937]">{reservationsQuery.data?.count ?? 0}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!reservationsQuery.data?.previous}
              >
                Précédent
              </Button>
              <span className="px-2 text-sm font-medium text-slate-700">Page {page}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={!reservationsQuery.data?.next}
              >
                Suivant
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelingReservationId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-[#0F172A]">Êtes-vous sûr de vouloir annuler cette réservation ?</h2>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {cancellationPreviewQuery.isLoading ? (
                <div className="flex items-center gap-3">
                  <LoadingSpinner size="sm" aria-label="Chargement des montants d'annulation" />
                  <span>Calcul des montants en cours...</span>
                </div>
              ) : null}

              {cancellationPreviewQuery.isError ? (
                <Alert variant="danger" message="Les montants d'annulation ne sont pas disponibles pour le moment." />
              ) : null}

              {cancelMutation.isError ? (
                <Alert variant="danger" message="L'annulation n'a pas pu être finalisée. Veuillez réessayer." />
              ) : null}

              {cancellationPreviewQuery.data ? (
                <div className="space-y-1">
                  <p>Montant payé : {formatEuro(cancellationPreviewQuery.data.amount_paid)}</p>
                  <p>Frais d'annulation : {formatEuro(cancellationPreviewQuery.data.cancellation_fee)}</p>
                  <p>Montant remboursé : {formatEuro(cancellationPreviewQuery.data.refundable_amount)}</p>
                  <p>Caution : libérée intégralement</p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setCancelingReservationId(null)}
                disabled={cancelMutation.isPending}
              >
                Non, conserver ma réservation
              </Button>
              <Button
                variant="danger"
                onClick={() => void cancelMutation.mutateAsync()}
                disabled={
                  cancelMutation.isPending
                  || cancellationPreviewQuery.isLoading
                  || !cancellationPreviewQuery.data?.can_cancel
                }
              >
                {cancelMutation.isPending ? 'Annulation en cours...' : 'Oui, annuler ma réservation'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}