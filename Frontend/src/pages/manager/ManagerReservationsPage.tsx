import { professionalDisplay } from '../../i18n/professionalDisplay'
import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge from '../../components/ui/StatusBadge'
import { getInvoiceDownload } from '../../services/invoiceService'
import { cancelManagementReservation, getManagementReservations } from '../../services/managementReservationService'
import type { ManagementReservationListQueryParams, ReservationManagementDetail } from '../../types/managementReservation'
import { resolveMediaUrl } from '../../utils/media'
import { getReservationStatusUi } from '../../utils/reservationStatus'

interface ManagerReservationsPageProps {
  basePath?: string
}

const actionButtonClassName = 'shrink-0 whitespace-nowrap px-2.5! text-[13px]!'
const cancelButtonClassName = `${actionButtonClassName} gap-1.5! border border-red-200 bg-red-50! text-red-700! hover:bg-red-100! focus-visible:ring-red-400!`

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(clientLocale(), {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value)).replace(',', '')
}

function formatAmount(value: string): string {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(clientLocale(), { style: 'currency', currency: 'EUR' }).format(amount)
    : `${value} EUR`
}

function clientLabel(reservation: ReservationManagementDetail): string | null {
  if (!reservation.client_summary) {
    return null
  }

  const fullName = `${reservation.client_summary.last_name} ${reservation.client_summary.first_name}`.trim()

  if (fullName.length > 0) {
    return fullName
  }

  return reservation.client_summary.email || null
}

function VehiclePhoto({ reservation, mobile = false }: { reservation: ReservationManagementDetail; mobile?: boolean }) {
  const { t } = useTranslation()
  const photoUrl = resolveMediaUrl(reservation.vehicle.main_photo?.file)
  const sizeClass = mobile ? 'h-20 w-28' : 'h-10 w-14'

  if (!photoUrl) {
    return (
      <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-2 text-center text-xs text-slate-500`}>
        {t("professional.sans_photo")}</div>
    )
  }

  return (
    <img
      src={photoUrl}
      alt={`${reservation.vehicle.brand} ${reservation.vehicle.model_name}`}
      className={`${sizeClass} shrink-0 rounded-xl border border-slate-200 object-cover`}
      loading="lazy"
    />
  )
}

function Period({ reservation }: { reservation: ReservationManagementDetail }) {
  return (
    <div className="text-sm leading-5 text-[#1F2937]">
      <p className="whitespace-nowrap">{formatDateTime(reservation.start_at)}</p>
      <p className="whitespace-nowrap"><span className="text-slate-400">→</span> {formatDateTime(reservation.end_at)}</p>
    </div>
  )
}

export default function ManagerReservationsPage({ basePath = '/manager' }: ManagerReservationsPageProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [downloadingInvoiceForId, setDownloadingInvoiceForId] = useState<number | null>(null)
  const [invoiceDownloadError, setInvoiceDownloadError] = useState<string | null>(null)
  const [reservationToCancel, setReservationToCancel] = useState<ReservationManagementDetail | null>(null)
  const [cancellationError, setCancellationError] = useState<string | null>(null)

  const queryParams = useMemo<ManagementReservationListQueryParams>(() => ({
    page,
    ordering: '-created_at',
  }), [page])

  const reservationsQuery = useQuery({
    queryKey: ['manager-reservations', queryParams],
    queryFn: () => getManagementReservations(queryParams),
  })

  const cancellationMutation = useMutation({
    mutationFn: (reservationId: number) => cancelManagementReservation(reservationId),
    onSuccess: async () => {
      setReservationToCancel(null)
      await queryClient.invalidateQueries({ queryKey: ['manager-reservations'] })
    },
    onError: () => {
      setCancellationError('La réservation n’a pas pu être annulée. Actualisez la liste puis réessayez.')
    },
  })

  const reservations = useMemo(
    () => reservationsQuery.data?.results ?? [],
    [reservationsQuery.data?.results],
  )

  const totalPages = Math.max(1, Math.ceil((reservationsQuery.data?.count ?? 0) / 20))
  const handleInvoiceDownload = async (reservation: ReservationManagementDetail) => {
    if (!reservation.invoice_id || downloadingInvoiceForId !== null) return

    setInvoiceDownloadError(null)
    setDownloadingInvoiceForId(reservation.id)
    try {
      const pdfBlob = await getInvoiceDownload(reservation.invoice_id)
      const downloadUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `GetaCar_Facture_${reservation.reference}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch {
      setInvoiceDownloadError(`La facture de la réservation ${reservation.reference} n’est pas disponible au téléchargement.`)
    } finally {
      setDownloadingInvoiceForId(null)
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-semibold text-[#0F172A]">{t("professional.gestion_des_reservations")}</h1>
      </div>

      {reservationsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label={t("client.chargement_des_reservations")} />
        </div>
      ) : null}

      {reservationsQuery.isError ? (
        <Alert
          variant="danger"
          title={t("client.chargement_impossible")}
          message={t("professional.les_reservations_n_ont_pas_pu_etre_recuperees_veuillez_reessayer")}
        />
      ) : null}

      {invoiceDownloadError ? (
        <Alert variant="danger" title={t("client.telechargement_impossible_alt")} message={professionalDisplay(t, invoiceDownloadError)} />
      ) : null}

      {!reservationsQuery.isLoading && !reservationsQuery.isError ? (
        <p className="text-sm text-slate-600">
          {reservationsQuery.data?.count ?? 0} {t("professional.resultat")}{(reservationsQuery.data?.count ?? 0) > 1 ? 's' : ''}
        </p>
      ) : null}

      {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length === 0 ? (
        <EmptyState
          title={t("client.aucune_reservation")}
          description={t("professional.il_n_y_a_actuellement_aucune_reservation_a_afficher")}
        />
      ) : null}

      {!reservationsQuery.isLoading
      && !reservationsQuery.isError
      && reservations.length > 0 ? (
        <>
          <div className="space-y-4 lg:hidden">
            {reservations.map((reservation) => {
              const status = getReservationStatusUi(reservation.status, reservation.cancellation_source)
              const canCancel = reservation.status === 'CONFIRMEE'
              return (
                <Card key={reservation.id}>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <VehiclePhoto reservation={reservation} mobile />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#0F172A]">{reservation.reference}</p>
                        <p className="mt-1 text-sm font-medium text-[#1F2937]">{reservation.vehicle.brand} {reservation.vehicle.model_name}</p>
                        <p className="text-xs text-slate-500">{reservation.vehicle.registration_plate || '—'}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge variant={status.variant} label={professionalDisplay(t, status.label)} />
                          {reservation.needs_review ? <StatusBadge variant="warning" label={t("professional.a_verifier")} /> : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">{t("client.client")}</p>
                        <p className="mt-1 font-medium text-[#1F2937]">{clientLabel(reservation) ?? '—'}</p>
                        {reservation.client_summary?.email ? <p className="break-all text-xs text-slate-500">{reservation.client_summary.email}</p> : null}
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">{t("client.periode")}</p>
                        <div className="mt-1"><Period reservation={reservation} /></div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">{t("client.montant")}</p>
                        <p className="mt-1 font-semibold text-[#1F2937]">{formatAmount(reservation.rental_amount)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Link to={`${basePath}/reservations/${reservation.id}`}>
                        <Button variant="secondary" size="sm">{t("public.voir_detail")}</Button>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!reservation.invoice_id || downloadingInvoiceForId !== null}
                        title={reservation.invoice_id ? undefined : t("professional.aucune_facture_disponible")}
                        onClick={() => void handleInvoiceDownload(reservation)}
                      >
                        {downloadingInvoiceForId === reservation.id ? t("client.telechargement_alt") : t("professional.telecharger_facture")}
                      </Button>
                      {reservation.status === 'REAFFECTATION_REQUIRED' ? (
                        <Link to={`${basePath}/reservations/${reservation.id}?action=reassign`}>
                          <Button size="sm">{t("professional.reaffecter")}</Button>
                        </Link>
                      ) : null}
                      {canCancel ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className={cancelButtonClassName}
                          onClick={() => {
                            setCancellationError(null)
                            setReservationToCancel(reservation)
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          {t("professional.supprimer")}</Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] lg:block">
            <table className="manager-reservations-table w-full border-collapse text-left">
              <thead className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                <tr>
                  <th className="w-16 px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("professional.photo")}</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("client.reference_alt")}</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("client.client")}</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("client.vehicule_alt")}</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("client.periode")}</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("client.montant")}</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("client.statut")}</th>
                  <th className="w-px whitespace-nowrap px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("professional.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => {
                  const status = getReservationStatusUi(reservation.status, reservation.cancellation_source)
                  const canCancel = reservation.status === 'CONFIRMEE'
                  return (
                    <tr key={reservation.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F9FAFB]">
                      <td className="px-2 py-3"><VehiclePhoto reservation={reservation} /></td>
                      <td className="whitespace-nowrap px-2 py-3 text-[13px] font-semibold text-[#0F172A]">{reservation.reference}</td>
                      <td className="px-2 py-3 text-sm">
                        <div className="w-32">
                          <p className="truncate font-medium text-[#1F2937]" title={clientLabel(reservation) ?? undefined}>{clientLabel(reservation) ?? '—'}</p>
                          {reservation.client_summary?.email ? <p className="truncate text-xs text-slate-500" title={reservation.client_summary.email}>{reservation.client_summary.email}</p> : null}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-sm">
                        <div className="w-32">
                          <p className="truncate font-medium text-[#1F2937]" title={`${reservation.vehicle.brand} ${reservation.vehicle.model_name}`}>{reservation.vehicle.brand} {reservation.vehicle.model_name}</p>
                          <p className="truncate text-xs text-slate-500">{reservation.vehicle.registration_plate || '—'}</p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3"><Period reservation={reservation} /></td>
                      <td className="whitespace-nowrap px-2 py-3 text-sm font-semibold text-[#1F2937]">{formatAmount(reservation.rental_amount)}</td>
                      <td className="px-2 py-3">
                        <div className="flex max-w-32 flex-wrap gap-1.5">
                          <StatusBadge variant={status.variant} label={professionalDisplay(t, status.label)} />
                          {reservation.needs_review ? <StatusBadge variant="warning" label={t("professional.a_verifier")} /> : null}
                        </div>
                      </td>
                      <td className="w-px whitespace-nowrap px-2 py-3">
                        <div className="flex flex-nowrap items-center gap-1.5">
                          <Link to={`${basePath}/reservations/${reservation.id}`} className="shrink-0">
                            <Button variant="secondary" size="sm" className={actionButtonClassName}>{t("public.voir_detail")}</Button>
                          </Link>
                          <Button
                            variant="secondary"
                            size="sm"
                            className={actionButtonClassName}
                            disabled={!reservation.invoice_id || downloadingInvoiceForId !== null}
                            title={reservation.invoice_id ? undefined : t("professional.aucune_facture_disponible")}
                            onClick={() => void handleInvoiceDownload(reservation)}
                          >
                            {downloadingInvoiceForId === reservation.id ? t("client.telechargement_alt") : t("professional.telecharger_facture")}
                          </Button>
                          {reservation.status === 'REAFFECTATION_REQUIRED' ? (
                            <Link to={`${basePath}/reservations/${reservation.id}?action=reassign`} className="shrink-0">
                              <Button size="sm" className={actionButtonClassName}>{t("professional.reaffecter")}</Button>
                            </Link>
                          ) : null}
                          {canCancel ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className={cancelButtonClassName}
                              onClick={() => {
                                setCancellationError(null)
                                setReservationToCancel(reservation)
                              }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              {t("professional.supprimer")}</Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
              <p className="text-sm text-slate-600">{t("client.page")} {page} / {totalPages}</p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={!reservationsQuery.data?.previous || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t("client.precedent_alt")}</Button>
                <Button type="button" variant="secondary" size="sm" disabled={!reservationsQuery.data?.next || page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>{t("client.suivant")}</Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {reservationToCancel ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-reservation-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !cancellationMutation.isPending) {
              setReservationToCancel(null)
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="cancel-reservation-title" className="text-xl font-semibold text-[#0F172A]">{t("professional.supprimer_cette_reservation")}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {t("professional.la_reservation_sera_annulee_par_le_gestionnaire_et_restera_conservee_dans_l")}</p>
            {cancellationError ? <Alert variant="danger" title={t("client.annulation_impossible")} message={professionalDisplay(t, cancellationError)} className="mt-4" /> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                disabled={cancellationMutation.isPending}
                onClick={() => setReservationToCancel(null)}
              >
                {t("client.annuler")}</Button>
              <Button
                variant="danger"
                disabled={cancellationMutation.isPending}
                onClick={() => cancellationMutation.mutate(reservationToCancel.id)}
              >
                {t("professional.confirmer_la_suppression")}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
