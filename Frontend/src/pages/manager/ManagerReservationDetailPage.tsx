import { professionalDisplay } from '../../i18n/professionalDisplay'
import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import ReservationReassignmentPanel from '../../components/reservations/ReservationReassignmentPanel'
import { getInvoiceDownload } from '../../services/invoiceService'
import {
  getManagementReservationById,
  getManagementReturnClosureReadiness,
  settleManagementReservationDeposit,
  updateManagementAdditionalCharges,
  validateManagementReservationReturn,
} from '../../services/managementReservationService'
import type {
  ManagementAdditionalChargesUpdateRequest,
  ManagementReturnClosureReadiness,
  ManagementDepositStatus,
  ManagementInspection,
  ReservationAdditionalChargeType,
  ManagementReservationStatus,
  ReservationCancellationSource,
  ReservationDepositSettlementResponse,
  ReservationManagementClientSummary,
  ReservationManagementDetail,
  ReservationManagementVehicleSummary,
} from '../../types/managementReservation'
import type { InspectionPhoto, PhotoType } from '../../types/inspection'
import { resolveMediaUrl } from '../../utils/media'
import { canEditManagerReturnCharges, closeManagerReturn, isDepositSettled, ReturnClosureError } from '../../utils/managerReturnClosure'

interface ManagerReservationDetailPageProps {
  basePath?: string
}

function getReservationStatusLabel(
  status: ManagementReservationStatus,
  cancellationSource: ReservationCancellationSource | null,
): string {
  switch (status) {
    case 'BROUILLON':
      return 'Réservation en brouillon'
    case 'EN_ATTENTE_CAUTION':
      return 'Réservation en attente de caution'
    case 'EN_ATTENTE_PAIEMENT':
      return 'Réservation en attente de paiement'
    case 'CONFIRMEE':
      return 'Réservation confirmée'
    case 'REAFFECTATION_REQUIRED':
      return 'Réservation à réaffecter'
    case 'EN_COURS':
      return 'Réservation en cours'
    case 'A_CONTROLER':
      return 'Réservation à contrôler'
    case 'TERMINEE':
      return 'Réservation terminée'
    case 'NON_UTILISEE':
      return 'Réservation non utilisée'
    case 'ANNULEE':
      if (cancellationSource === 'CLIENT') return 'Annulée par le client'
      if (cancellationSource === 'GESTIONNAIRE') return 'Annulée par le gestionnaire'
      return 'Réservation annulée'
    case 'PAIEMENT_ECHOUE':
      return 'Réservation au paiement échoué'
  }
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString(clientLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatNullableNumber(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${value}${suffix}`
}

function formatGeneralCondition(value: ManagementInspection['general_condition']): string {
  switch (value) {
    case 'BON':
      return 'Bon'
    case 'A_SURVEILLER':
      return 'À surveiller'
    case 'MAUVAIS':
      return 'Mauvais'
    default:
      return 'Non renseigné'
  }
}

function toErrorState(error: unknown): { title: string; message: string } {
  if (!axios.isAxiosError(error)) {
    return {
      title: 'Chargement impossible',
      message: 'Une erreur inattendue est survenue. Veuillez reessayer.',
    }
  }

  if (error.response?.status === 403) {
    return {
      title: 'Acces refuse',
      message: 'Seul un gestionnaire autorise peut consulter cet ecran de controle.',
    }
  }

  if (error.response?.status === 404) {
    return {
      title: 'Retour introuvable',
      message: 'La reservation demandee est introuvable.',
    }
  }

  const data: unknown = error.response?.data
  if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
    return { title: 'Action impossible', message: data.message }
  }

  return {
    title: 'Chargement impossible',
    message: 'Impossible de recuperer le retour a verifier.',
  }
}

const panelClass = 'min-w-0 rounded-md border border-gray-200 bg-white p-3'
const secondaryClass = 'inline-flex items-center rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50'
const inputClass = 'w-full rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-gray-600 disabled:bg-gray-100'

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className={panelClass}>
      <p className="font-semibold">{title}</p>
      <p>{message}</p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="break-words text-sm">{value}</p>
    </div>
  )
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || '—'
}

function formatClientName(client: ReservationManagementClientSummary): string {
  return displayValue(`${client.first_name} ${client.last_name}`.trim())
}

function formatCurrency(value: string | null | undefined): string {
  if (!value?.trim()) {
    return '—'
  }

  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return `${value} EUR`
  }

  return new Intl.NumberFormat(clientLocale(), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)
}

function getParkingLabel(vehicle: ReservationManagementVehicleSummary): string {
  const parkingParts = [vehicle.parking_name, vehicle.parking_space_number]
    .map((part) => part?.trim())
    .filter(Boolean)

  return parkingParts.length > 0 ? parkingParts.join(' / ') : '—'
}

interface ReservationSummaryCardProps {
  vehicle: ReservationManagementVehicleSummary
  client: ReservationManagementClientSummary
  rentalAmount: string
  hasPaidRental: boolean
  depositAmount: string
  startAt: string
  endAt: string
  departureInspection: ManagementInspection | null
  returnInspection: ManagementInspection | null
}

function ReservationSummaryCard({
  vehicle,
  client,
  rentalAmount,
  hasPaidRental,
  depositAmount,
  startAt,
  endAt,
  departureInspection,
  returnInspection,
}: ReservationSummaryCardProps) {
  const { t } = useTranslation()
  const photoUrl = resolveMediaUrl(vehicle.main_photo?.file)
  const vehicleName = displayValue(`${vehicle.brand} ${vehicle.model_name}`.trim())

  return (
    <section className={panelClass}>
      <h2 className="mb-2 font-semibold">{t("professional.reservation_actuelle")}</h2>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 text-center text-xs text-gray-600">
            {photoUrl ? <img src={photoUrl} alt={vehicleName} className="h-full w-full object-cover" /> : t("client.photo_indisponible")}
          </div>
          <div className="min-w-0 break-words text-sm">
            <p className="font-semibold">{vehicleName}</p>
            <p>{displayValue(vehicle.category)}</p>
            <p>{displayValue(vehicle.registration_plate)}</p>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
          <div className="min-w-0">
            <Field label={t("client.client")} value={formatClientName(client)} />
            <p className="break-all text-sm">{displayValue(client.email)}</p>
          </div>
          <Field label={t("professional.parking_emplacement")} value={getParkingLabel(vehicle)} />
          <Field label={hasPaidRental ? t("professional.location_payee") : t("professional.montant_de_la_location")} value={formatCurrency(rentalAmount)} />
          <div className="text-sm">
            <p className="text-xs font-medium text-gray-600">{t("professional.periode_reservee")}</p>
            <p>{t("professional.du")} {formatDateTime(startAt)}</p>
            <p>{t("professional.au")} {formatDateTime(endAt)}</p>
          </div>
          <div className="text-sm">
            <p className="text-xs font-medium text-gray-600">{t("professional.periode_reelle")}</p>
            <p>{t("professional.depart")} {formatDateTime(departureInspection?.completed_at ?? null)}</p>
            <p>{t("client.retour")} {formatDateTime(returnInspection?.completed_at ?? null)}</p>
          </div>
          <Field label={t("public.caution")} value={formatCurrency(depositAmount)} />
        </div>
      </div>
    </section>
  )
}

type PhotoComparisonSlot = {
  label: string
  photoType: PhotoType
  position?: number
}

const RETURN_COMPARISON_SLOTS: PhotoComparisonSlot[] = [
  { label: 'Avant gauche', photoType: 'AVANT' },
  { label: 'Avant droit', photoType: 'COTE_DROIT' },
  { label: 'Arrière gauche', photoType: 'COTE_GAUCHE' },
  { label: 'Arrière droit', photoType: 'ARRIERE' },
  { label: 'Tableau de bord', photoType: 'TABLEAU_DE_BORD' },
  { label: 'Sièges avant', photoType: 'INTERIEUR', position: 1 },
  { label: 'Sièges arrière', photoType: 'INTERIEUR', position: 2 },
  { label: 'Coffre', photoType: 'AUTRE', position: 1 },
]

function findPhotoBySlot(inspection: ManagementInspection | null, slot: PhotoComparisonSlot): InspectionPhoto | null {
  if (!inspection) {
    return null
  }

  return inspection.photos.find((photo) => {
    if (photo.photo_type !== slot.photoType) {
      return false
    }

    if (slot.position !== undefined) {
      return photo.position === slot.position
    }

    return true
  }) ?? null
}

interface PhotoPreview {
  src: string
  label: string
}

function InspectionPhotoThumbnail({ photo, label, inspectionTitle, onPreview }: {
  photo: InspectionPhoto | null
  label: string
  inspectionTitle: string
  onPreview: (photo: PhotoPreview) => void
}) {
  const { t } = useTranslation()
  const src = resolveMediaUrl(photo?.file)

  return (
    <div className="min-w-0">
      {src ? (
        <button
          type="button"
          className="block aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
          aria-label={`Agrandir : ${inspectionTitle} — ${label}`}
          onClick={() => onPreview({ src, label: `${inspectionTitle} — ${label}` })}
        >
          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
        </button>
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-1 text-center text-xs leading-tight text-gray-500">
          {t("client.non_disponible")}</div>
      )}
      <p className="mt-1 text-center text-xs font-medium leading-4 text-gray-600">{label}</p>
    </div>
  )
}

function getSeverityLabel(severity: ManagementInspection['damages'][number]['severity']): string {
  switch (severity) {
    case 'GRAVE':
      return 'Dangereux'
    case 'ACCEPTABLE':
      return 'Acceptable'
    case 'CRITIQUE':
      return 'Critique'
    case 'MAJEUR':
      return 'Majeur'
    case 'MODERE':
      return 'Modéré'
    case 'MINEUR':
      return 'Mineur'
  }
}

interface InspectionCardProps {
  title: string
  inspection: ManagementInspection | null
  onPreview: (photo: PhotoPreview) => void
}

function InspectionCard({ title, inspection, onPreview }: InspectionCardProps) {
  const { t } = useTranslation()
  const inspectionDate = inspection?.completed_at ?? inspection?.started_at ?? null
  const damages = inspection?.damages ?? []

  return (
    <article className="min-w-0 overflow-hidden rounded border border-gray-200 bg-white @container">
      <header className="border-b border-gray-200 px-2 py-1.5">
        <h3 className="text-base font-semibold leading-5 text-black">{title}</h3>
        <p className="mt-1 text-sm text-gray-600">{inspectionDate ? formatDateTime(inspectionDate) : t("client.non_disponible")}</p>
      </header>
      {inspection ? (
        <div className="space-y-2 p-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label={t("professional.kilometrage")} value={formatNullableNumber(inspection?.mileage, ' km')} />
            <Field label={t("professional.carburant_energie")} value={formatNullableNumber(inspection?.energy_level_percent, ' %')} />
            <div className="col-span-2 sm:col-span-1">
              <Field label={t("professional.proprete_etat_general")} value={formatGeneralCondition(inspection?.general_condition)} />
            </div>
          </div>
          <div className="border-t border-gray-200 pt-2">
            <h4 className="text-sm font-semibold text-black">{t("professional.photos")}</h4>
            <div className="mt-1 grid grid-cols-4 gap-1.5 @min-[34rem]:grid-cols-8">
              {RETURN_COMPARISON_SLOTS.map((slot) => (
                <InspectionPhotoThumbnail
                  key={`${slot.photoType}-${slot.position ?? 0}`}
                  photo={findPhotoBySlot(inspection, slot)}
                  label={professionalDisplay(t, slot.label)}
                  inspectionTitle={title}
                  onPreview={onPreview}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-2">
            <h4 className="text-sm font-semibold text-black">{t("professional.dommages_declares")}</h4>
            {damages.length === 0 ? (
              <p className="mt-1 text-sm text-gray-600">{t("professional.aucun_dommage_declare")}</p>
            ) : (
              <div className="mt-1 space-y-1">
                {damages.map((damage) => {
                  const severity = getSeverityLabel(damage.severity)
                  const evidencePhoto = inspection.photos.find((photo) => damage.photo_ids.includes(photo.id)) ?? null
                  const evidencePhotoUrl = resolveMediaUrl(evidencePhoto?.file)

                  return (
                    <div key={damage.id} className="rounded border border-gray-200 p-2">
                      <div className="flex items-start gap-3">
                        {evidencePhotoUrl ? (
                          <button
                            type="button"
                            className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
                            aria-label={`Agrandir la preuve du dommage : ${damage.description}`}
                            onClick={() => onPreview({ src: evidencePhotoUrl, label: `Preuve du dommage : ${damage.description}` })}
                          >
                            <img src={evidencePhotoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          </button>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm leading-5 text-black">{displayValue(damage.description)}</p>
                          <p className="text-xs text-gray-600">{severity}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="p-4 text-sm text-gray-500">{t("professional.inspection_non_disponible")}</p>
      )}
    </article>
  )
}

function PhotoPreviewDialog({ photo, onClose }: { photo: PhotoPreview; onClose: () => void }) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => {
      dialog?.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      aria-label={`Aperçu : ${photo.label}`}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className="min-w-0 break-words text-base font-semibold text-black">{photo.label}</h3>
        <button type="button" className={secondaryClass} onClick={onClose}>{t("client.fermer")}</button>
      </div>
      <img src={photo.src} alt={photo.label} className="mx-auto mt-4 max-h-[70vh] max-w-full object-contain" />
    </dialog>
  )
}

function InspectionDifferences({ departure, returned }: {
  departure: ManagementInspection | null
  returned: ManagementInspection | null
}) {
  const { t } = useTranslation()
  const startMileage = departure?.mileage
  const endMileage = returned?.mileage
  const startEnergy = departure?.energy_level_percent
  const endEnergy = returned?.energy_level_percent
  const mileageDifference = startMileage != null && endMileage != null ? endMileage - startMileage : null
  const energyDifference = startEnergy != null && endEnergy != null ? endEnergy - startEnergy : null
  const condition = departure?.general_condition && returned?.general_condition
    ? `${formatGeneralCondition(departure.general_condition)} → ${formatGeneralCondition(returned.general_condition)}`
    : 'Comparaison indisponible'
  const damageComparison = departure?.status !== 'TERMINE' || returned?.status !== 'TERMINE'
    ? 'Comparaison indisponible'
    : returned.damages.length === 0
      ? 'Aucun dommage déclaré au retour'
      : 'Comparaison indisponible'

  return (
    <div className="border-t border-gray-200 pt-2">
      <h3 className="text-base font-semibold text-black">{t("professional.differences_depart_retour")}</h3>
      <div className="mt-1 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Field label={t("professional.kilometres_parcourus")} value={mileageDifference === null ? 'Comparaison indisponible' : mileageDifference < 0 ? `${mileageDifference} km — écart à vérifier` : `${mileageDifference} km`} />
        <Field label={t("professional.difference_de_carburant_energie")} value={energyDifference === null ? 'Comparaison indisponible' : `${energyDifference > 0 ? '+' : ''}${energyDifference} points de %`} />
        <Field label={t("professional.etat_general")} value={condition} />
        <Field label={t("professional.nouveaux_degats_eventuels")} value={damageComparison} />
      </div>
    </div>
  )
}

function VehicleInspectionControl({ departure, returned }: {
  departure: ManagementInspection | null
  returned: ManagementInspection | null
}) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<PhotoPreview | null>(null)

  return (
    <section className={panelClass}>
      <h2 className="mb-2 font-semibold">{t("professional.controle_du_vehicule")}</h2>
      <div className="grid gap-2 md:grid-cols-2">
        <InspectionCard title={t("professional.etat_au_depart_check_in")} inspection={departure} onPreview={setPreview} />
        <InspectionCard title={t("professional.etat_au_retour_check_out")} inspection={returned} onPreview={setPreview} />
      </div>
      <div className="mt-2">
        <InspectionDifferences departure={departure} returned={returned} />
      </div>
      {preview ? <PhotoPreviewDialog photo={preview} onClose={() => setPreview(null)} /> : null}
    </section>
  )
}

type AdditionalChargeFormState = Record<ReservationAdditionalChargeType, { amount: string; justification: string }>

const CHARGE_TYPE_ROWS: Array<{ type: ReservationAdditionalChargeType; label: string }> = [
  { type: 'RETARD', label: 'Retard' },
  { type: 'CARBURANT', label: 'Carburant manquant' },
  { type: 'KILOMETRAGE', label: 'Kilomètres supplémentaires' },
  { type: 'DEGATS', label: 'Dégâts' },
]

function parseChargeAmount(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function formatChargeInput(value: string): string {
  const amount = parseChargeAmount(value)
  return amount === null ? '0.00' : amount.toFixed(2)
}

function buildDefaultAdditionalChargesFormState(reservation: {
  additional_charges: Array<{ charge_type: ReservationAdditionalChargeType; amount: string; justification: string; status: string }>
  return_delay_fee: string | null
  return_fuel_fee: string | null
}): AdditionalChargeFormState {
  const initial: AdditionalChargeFormState = {
    RETARD: { amount: '0.00', justification: '' },
    CARBURANT: { amount: '0.00', justification: '' },
    KILOMETRAGE: { amount: '0.00', justification: '' },
    DEGATS: { amount: '0.00', justification: '' },
  }

  for (const charge of reservation.additional_charges) {
    if (charge.status === 'ANNULEE') continue
    initial[charge.charge_type] = {
      amount: formatChargeInput(charge.amount),
      justification: charge.justification ?? '',
    }
  }

  if (parseChargeAmount(initial.RETARD.amount) === 0 && reservation.return_delay_fee) {
    initial.RETARD.amount = formatChargeInput(reservation.return_delay_fee)
  }
  if (parseChargeAmount(initial.CARBURANT.amount) === 0 && reservation.return_fuel_fee) {
    initial.CARBURANT.amount = formatChargeInput(reservation.return_fuel_fee)
  }

  return initial
}

const DEPOSIT_STATUS_LABELS: Record<ManagementDepositStatus, string> = {
  CREE: 'Créée',
  EN_ATTENTE: 'En attente',
  AUTORISEE: 'Autorisée',
  A_VERIFIER: 'À vérifier',
  CAPTUREE: 'Capturée',
  LIBEREE: 'Libérée',
  ECHOUEE: 'Échouée',
  ANNULEE: 'Annulée',
  EXPIREE: 'Expirée',
}

function getChargeError({ amount: input, justification }: AdditionalChargeFormState[ReservationAdditionalChargeType]) {
  const amount = parseChargeAmount(input)
  if (amount === null || amount > 99_999_999.99) return 'Montant invalide (deux décimales maximum).'
  if (amount > 0 && !justification.trim()) return 'Justification obligatoire pour un montant supérieur à 0 €.'
  return undefined
}

function buildChargesPayload(formState: AdditionalChargeFormState): ManagementAdditionalChargesUpdateRequest {
  return {
    charges: CHARGE_TYPE_ROWS.map(({ type }) => ({
      charge_type: type,
      amount: formatChargeInput(formState[type].amount),
      justification: formState[type].justification.trim(),
    })),
  }
}

function ReturnClosureConfirmation({
  depositStatus,
  total,
  retained,
  pending,
  onCancel,
  onConfirm,
}: {
  depositStatus: ManagementReturnClosureReadiness['deposit_status']
  total: string
  retained: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="closure-confirmation"
      className="m-auto w-[calc(100%-2rem)] max-w-xs rounded-md border border-gray-300 bg-white p-4 text-black backdrop:bg-black/30"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onCancel()
      }}
    >
      <h3 id="closure-confirmation" className="mb-3 font-semibold">{t("professional.confirmer_la_cloture")}</h3>
      <div className="space-y-2">
        <Field label={t("professional.total_des_frais")} value={formatCurrency(total)} />
        <Field label={isDepositSettled(depositStatus) ? t("professional.retenue_effectuee") : t("professional.retenue_a_effectuer")} value={formatCurrency(retained)} />
        <Field label={t("professional.statut_de_la_caution")} value={DEPOSIT_STATUS_LABELS[depositStatus]} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={secondaryClass} disabled={pending} onClick={onCancel}>{t("client.annuler")}</button>
        <button type="button" className={secondaryClass} disabled={pending} onClick={onConfirm}>
          {pending ? t("professional.cloture_en_cours") : t("professional.confirmer")}
        </button>
      </div>
    </dialog>
  )
}

function AdditionalChargesSection({
  reservation,
  onSaved,
  isSaving,
  onSave,
  saveError,
  showSaveAction,
  settlementResult,
}: {
  reservation: ReservationManagementDetail
  onSaved: number
  isSaving: boolean
  onSave: (payload: AdditionalChargeFormState) => void
  saveError: string | null
  showSaveAction: boolean
  settlementResult: ReservationDepositSettlementResponse | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState<{
    readiness: ManagementReturnClosureReadiness
    payload: ManagementAdditionalChargesUpdateRequest
  } | null>(null)
  const closureInFlight = useRef(false)
  const readinessQuery = useQuery({
    queryKey: ['manager-return-closure', reservation.id],
    queryFn: () => getManagementReturnClosureReadiness(reservation.id),
    enabled: !showSaveAction && reservation.status === 'A_CONTROLER',
    retry: false,
  })
  const closureMutation = useMutation({
    mutationFn: ({ readiness, payload }: NonNullable<typeof confirmation>) => closeManagerReturn(readiness, payload, {
      read: () => getManagementReturnClosureReadiness(reservation.id),
      save: (charges) => updateManagementAdditionalCharges(reservation.id, charges),
      settle: (charges) => settleManagementReservationDeposit(reservation.id, charges),
      complete: () => validateManagementReservationReturn(reservation.id),
    }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-return-closure', reservation.id] }),
        queryClient.invalidateQueries({ queryKey: ['manager-reservation-detail', reservation.id] }),
        queryClient.invalidateQueries({ queryKey: ['manager-reservations'] }),
      ])
    },
  })
  const [formState, setFormState] = useState<AdditionalChargeFormState>(() => buildDefaultAdditionalChargesFormState(reservation))
  const [errors, setErrors] = useState<Partial<Record<ReservationAdditionalChargeType, string>>>({})
  const savedFormState = JSON.stringify(buildDefaultAdditionalChargesFormState(reservation))
  const [lastSynced, setLastSynced] = useState({ savedFormState, onSaved })

  if (lastSynced.savedFormState !== savedFormState || lastSynced.onSaved !== onSaved) {
    setLastSynced({ savedFormState, onSaved })
    setFormState(buildDefaultAdditionalChargesFormState(reservation))
    setErrors({})
  }

  const amounts = CHARGE_TYPE_ROWS.reduce<Record<ReservationAdditionalChargeType, number>>((acc, row) => {
    acc[row.type] = parseChargeAmount(formState[row.type].amount) ?? 0
    return acc
  }, { RETARD: 0, CARBURANT: 0, KILOMETRAGE: 0, DEGATS: 0 })

  const totalAdditionalCharges = amounts.RETARD + amounts.CARBURANT + amounts.KILOMETRAGE + amounts.DEGATS
  const readiness = readinessQuery.isError ? undefined : readinessQuery.data
  const depositAmount = Number(readiness?.deposit_amount ?? reservation.deposit_amount) || 0
  const maximumRetention = Number(readiness?.maximum_charge ?? reservation.deposit_amount) || 0
  const retainedOnDeposit = Math.min(totalAdditionalCharges, maximumRetention)
  const depositToRelease = Math.max(depositAmount - retainedOnDeposit, 0)
  const overDeposit = Math.max(totalAdditionalCharges - maximumRetention, 0)

  const depositStatus = readiness?.deposit_status ?? settlementResult?.deposit_status ?? reservation.deposit_status
  const isSettled = depositStatus === 'CAPTUREE' || depositStatus === 'LIBEREE'
  const hasActiveDeposit = depositStatus === 'AUTORISEE' || depositStatus === 'A_VERIFIER'
  const estimatedRetention = depositStatus === 'LIBEREE' ? '0.00' : hasActiveDeposit ? retainedOnDeposit.toFixed(2) : null
  const estimatedRelease = hasActiveDeposit ? depositToRelease.toFixed(2) : null
  const legacyReadOnly = reservation.status !== 'A_CONTROLER' || isSettled
    || reservation.additional_charges.some((charge) => charge.status === 'VALIDEE')
    || (reservation.return_charges_confirmed_at !== null
      && !reservation.additional_charges.some((charge) => charge.status === 'PROVISOIRE'))
  const isReadOnly = isSaving || closureMutation.isPending || confirmation !== null
    || (showSaveAction ? legacyReadOnly : !canEditManagerReturnCharges(reservation, readiness))

  const updateCharge = (type: ReservationAdditionalChargeType, field: 'amount' | 'justification', value: string) => {
    setFormState((current) => ({ ...current, [type]: { ...current[type], [field]: value } }))
    setErrors((current) => current[type]
      ? { ...current, [type]: getChargeError({ ...formState[type], [field]: value }) }
      : current)
  }

  const updateError = (type: ReservationAdditionalChargeType) => {
    setErrors((current) => ({ ...current, [type]: getChargeError(formState[type]) }))
  }

  const handleSave = () => {
    const nextErrors: Partial<Record<ReservationAdditionalChargeType, string>> = {}
    for (const row of CHARGE_TYPE_ROWS) {
      const error = getChargeError(formState[row.type])
      if (error) nextErrors[row.type] = error
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }
    onSave(formState)
  }

  const exceedsDeposit = readiness && !isDepositSettled(readiness.deposit_status)
    && Math.round(totalAdditionalCharges * 100) > Math.round(maximumRetention * 100)
  const formInvalid = CHARGE_TYPE_ROWS.some(({ type }) => getChargeError(formState[type]))
  const closureDisabled = !readiness || readinessQuery.isFetching || exceedsDeposit
    || (!isSettled && (formInvalid || isReadOnly)) || closureMutation.isPending
  const closureError = closureMutation.error
  const closureErrorMessage = closureError instanceof ReturnClosureError && axios.isAxiosError(closureError.cause)
    && typeof closureError.cause.response?.data?.message === 'string'
    ? `${closureError.message} ${closureError.cause.response.data.message}`
    : closureError?.message
  const confirmedTotal = confirmation?.payload.charges.reduce((total, charge) => total + Number(charge.amount), 0) ?? 0

  const confirmClosure = async () => {
    if (!confirmation || closureInFlight.current) return
    closureInFlight.current = true
    try {
      await closureMutation.mutateAsync(confirmation)
    } catch {
      // The mutation exposes the failed step, and refreshes server state before retry.
    } finally {
      setConfirmation(null)
      closureInFlight.current = false
    }
  }

  return (
    <section className={panelClass}>
      <h2 className="mb-2 font-semibold">{t("professional.frais_supplementaires")}</h2>
      {!showSaveAction && depositStatus === 'LIBEREE' ? (
        <p className="mb-2 text-sm">{t("professional.la_caution_est_deja_liberee_toute_nouvelle_retenue_sur_cette_caution_est")}</p>
      ) : null}
      {!showSaveAction && depositStatus === 'CAPTUREE' ? (
        <p className="mb-2 text-sm">{t("professional.la_retenue_sur_la_caution_a_deja_ete_effectuee_les_frais_valides")}</p>
      ) : null}
      {reservation.return_charges_estimate ? <p className="mb-2 text-sm text-gray-600">{t("professional.retard_constate")} {Math.ceil(reservation.return_charges_estimate.delay_seconds / 60)} min</p> : null}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-gray-200">
            <tr>
              <th scope="col" className="w-[32%] pb-1 pr-2 font-medium">{t("professional.type")}</th>
              <th scope="col" className="pb-1 pr-2 font-medium">{t("professional.justification")}</th>
              <th scope="col" className="w-[4.75rem] pb-1 text-right font-medium sm:w-24">{t("professional.montant")}</th>
            </tr>
          </thead>
          <tbody>
            {CHARGE_TYPE_ROWS.map(({ type, label }) => (
              <tr key={type} className="border-b border-gray-200 align-top">
                <th scope="row" className="break-words py-2 pr-2 font-medium">{label}</th>
                <td className="py-1.5 pr-2">
                  <textarea
                    rows={1}
                    value={formState[type].justification}
                    onChange={(event) => updateCharge(type, 'justification', event.target.value)}
                    onBlur={() => updateError(type)}
                    required={amounts[type] > 0}
                    disabled={isReadOnly}
                    aria-label={'Justification : ' + label}
                    aria-describedby={errors[type] ? 'charge-error-' + type : undefined}
                    className={inputClass}
                  />
                  {errors[type] ? <p id={'charge-error-' + type} className="text-xs font-medium">{errors[type]}</p> : null}
                </td>
                <td className="py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formState[type].amount}
                    onChange={(event) => updateCharge(type, 'amount', event.target.value)}
                    onBlur={() => updateError(type)}
                    disabled={isReadOnly}
                    aria-label={'Montant en euros : ' + label}
                    aria-describedby={errors[type] ? 'charge-error-' + type : undefined}
                    className={inputClass + ' text-right'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <aside aria-label={t("professional.recapitulatif_des_frais")} className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-gray-50 p-2 lg:grid-cols-1">
          <Field label={t("professional.total_des_frais_supplementaires")} value={formatCurrency(settlementResult?.charges_total ?? totalAdditionalCharges.toFixed(2))} />
          <Field label={hasActiveDeposit ? t("professional.retenue_sur_caution_estimee") : t("professional.retenue_sur_caution")} value={formatCurrency(readiness?.captured_amount ?? settlementResult?.captured_amount ?? estimatedRetention)} />
          <Field label={isSettled ? t("professional.solde_de_caution_libere") : t("professional.solde_de_caution_a_liberer")} value={formatCurrency(readiness?.released_amount ?? settlementResult?.released_amount ?? estimatedRelease)} />
          <Field label={t("professional.depassement_eventuel")} value={formatCurrency(settlementResult?.over_deposit_amount ?? overDeposit.toFixed(2))} />
          <Field label={t("professional.statut_de_la_caution_stripe")} value={depositStatus ? DEPOSIT_STATUS_LABELS[depositStatus] : 'Indisponible'} />
        </aside>
      </div>
      {saveError ? <Notice title={t("professional.enregistrement_impossible")} message={professionalDisplay(t, saveError)} /> : null}
      {showSaveAction ? (
        <button type="button" className={'mt-2 ' + secondaryClass} onClick={handleSave} disabled={isReadOnly}>
          {isSaving ? t("professional.enregistrement_en_cours") : t("professional.enregistrer_les_frais_supplementaires")}
        </button>
      ) : null}
      {!showSaveAction && reservation.status === 'A_CONTROLER' ? (
        <div className="mt-3 space-y-2">
          {closureErrorMessage ? <Notice title={t("professional.cloture_interrompue")} message={professionalDisplay(t, closureErrorMessage)} /> : null}
          {readinessQuery.isError ? (
            <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
              <p>{toErrorState(readinessQuery.error).message}</p>
              <button type="button" className={secondaryClass} onClick={() => void readinessQuery.refetch()}>{t("professional.reverifier")}</button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {exceedsDeposit ? <p className="text-sm">{t("professional.la_caution_ne_couvre_pas_les_frais_saisis")}</p> : null}
            {!isReadOnly && formInvalid ? <p className="text-sm">{t("professional.verifiez_les_montants_et_justifiez_chaque_frais_positif")}</p> : null}
            {readinessQuery.isFetching ? <p role="status" className="text-sm">{t("professional.verification_de_la_cloture")}</p> : null}
            <button
              type="button"
              disabled={closureDisabled || confirmation !== null}
              className="rounded bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                if (readiness && !closureDisabled) setConfirmation({ readiness, payload: buildChargesPayload(formState) })
              }}
            >
              {t("professional.valider_et_cloturer")}</button>
          </div>
          {confirmation ? (
            <ReturnClosureConfirmation
              depositStatus={confirmation.readiness.deposit_status}
              total={confirmedTotal.toFixed(2)}
              retained={confirmation.readiness.captured_amount ?? confirmedTotal.toFixed(2)}
              pending={closureMutation.isPending}
              onCancel={() => setConfirmation(null)}
              onConfirm={() => void confirmClosure()}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default function ManagerReservationDetailPage({ basePath = '/manager' }: ManagerReservationDetailPageProps) {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reservationId = Number(id)
  const isValidReservationId = Number.isInteger(reservationId) && reservationId > 0
  const [isInvoiceDownloading, setIsInvoiceDownloading] = useState(false)
  const [invoiceDownloadError, setInvoiceDownloadError] = useState<string | null>(null)
  const [saveChargesError, setSaveChargesError] = useState<string | null>(null)
  const [chargesRefreshToken, setChargesRefreshToken] = useState(0)
  const [showSettleConfirm, setShowSettleConfirm] = useState(false)
  const [settlementResult, setSettlementResult] = useState<ReservationDepositSettlementResponse | null>(null)
  const toastMessage = (location.state as { toast?: string } | null)?.toast ?? null

  useEffect(() => {
    if (!toastMessage) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      navigate(location.pathname, { replace: true, state: null })
    }, 4000)
    return () => window.clearTimeout(timeoutId)
  }, [location.pathname, navigate, toastMessage])

  const detailQuery = useQuery({
    queryKey: ['manager-reservation-detail', reservationId],
    queryFn: () => getManagementReservationById(reservationId),
    enabled: isValidReservationId,
  })

  const depositSettlementMutation = useMutation({
    mutationFn: () => settleManagementReservationDeposit(reservationId),
    onSuccess: async (data) => {
      setSettlementResult(data)
      setShowSettleConfirm(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-reservation-detail', reservationId] }),
      ])
    },
    onError: () => {
      setShowSettleConfirm(false)
    },
  })

  const refreshReservation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['manager-reservations'] }),
      queryClient.invalidateQueries({ queryKey: ['manager-reservation-detail', reservationId] }),
    ])
  }
  const additionalChargesMutation = useMutation({
    mutationFn: (payload: {
      charges: Array<{ charge_type: ReservationAdditionalChargeType; amount: string; justification: string }>
    }) => updateManagementAdditionalCharges(reservationId, payload),
    onSuccess: async () => {
      setSaveChargesError(null)
      setChargesRefreshToken((value) => value + 1)
      await refreshReservation()
    },
    onError: (error) => {
      setSaveChargesError(toErrorState(error).message)
    },
  })
  const completeMutation = useMutation({
    mutationFn: () => validateManagementReservationReturn(reservationId),
    onSuccess: refreshReservation,
  })

  const controlReservation = detailQuery.data
  const showLegacyActions = basePath === '/admin'

  if (!isValidReservationId) {
    return (
      <section className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Notice title={t("client.reservation_invalide_alt")} message={t("client.l_identifiant_de_reservation_est_invalide_alt")} />
        <Link to={`${basePath}/reservations`} className={secondaryClass}>{t("professional.retour_aux_reservations")}</Link>
      </section>
    )
  }

  if (detailQuery.isLoading) {
    return (
      <section className="mx-auto max-w-7xl bg-white px-4 py-3 text-sm text-black">
        <p role="status">{t("professional.chargement_de_la_reservation")}</p>
      </section>
    )
  }

  if (detailQuery.isError || !controlReservation) {
    const errorState = toErrorState(detailQuery.error)
    return (
      <section className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Notice title={errorState.title} message={errorState.message} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryClass} onClick={() => void detailQuery.refetch()}>{t("client.reessayer_alt")}</button>
          <Link to={`${basePath}/reservations`} className={secondaryClass}>{t("professional.retour_aux_reservations")}</Link>
        </div>
      </section>
    )
  }

  const reservation = controlReservation
  if (searchParams.get('action') === 'reassign' && reservation.status === 'REAFFECTATION_REQUIRED') {
    return <ReservationReassignmentPanel reservation={reservation} basePath={basePath} />
  }

  const reservationStatusLabel = getReservationStatusLabel(reservation.status, reservation.cancellation_source)
  const departureInspection = reservation.departure_inspection
  const returnInspection = reservation.return_inspection

  const handleInvoiceDownload = async () => {
    if (!reservation.invoice_id || isInvoiceDownloading) return

    setInvoiceDownloadError(null)
    setIsInvoiceDownloading(true)
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
      setInvoiceDownloadError('La facture n’est pas disponible au téléchargement pour le moment.')
    } finally {
      setIsInvoiceDownloading(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-3 bg-white px-3 py-3 text-black sm:px-4">
      {toastMessage ? (
        <div role="status" className="rounded border border-gray-200 bg-white px-3 py-2 text-sm">
          {toastMessage}
        </div>
      ) : null}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={basePath + '/reservations'} className={secondaryClass}>{t("professional.retour_a_la_liste")}</Link>
          <h1 className="text-lg font-semibold sm:text-xl">{t("professional.detail_de_la_reservation")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{reservationStatusLabel}</span>
          <button
            type="button"
            className={secondaryClass}
            disabled={!reservation.invoice_id || !reservation.invoice_pdf_available || isInvoiceDownloading}
            onClick={() => void handleInvoiceDownload()}
          >
            {isInvoiceDownloading ? t("client.telechargement_alt") : reservation.invoice_pdf_available ? t("client.telecharger_la_facture") : t("client.facture_indisponible")}
          </button>
        </div>
      </header>

      {invoiceDownloadError ? <Notice title={t("client.telechargement_impossible_alt")} message={professionalDisplay(t, invoiceDownloadError)} /> : null}

      <ReservationSummaryCard
        vehicle={reservation.vehicle}
        client={reservation.client_summary}
        rentalAmount={reservation.rental_amount}
        hasPaidRental={reservation.status === 'A_CONTROLER' || reservation.status === 'TERMINEE'}
        depositAmount={reservation.deposit_amount}
        startAt={reservation.start_at}
        endAt={reservation.end_at}
        departureInspection={departureInspection}
        returnInspection={returnInspection}
      />

      <VehicleInspectionControl departure={departureInspection} returned={returnInspection} />

      <section className="space-y-2">
        <AdditionalChargesSection
          key={reservation.id}
          reservation={reservation}
          showSaveAction={showLegacyActions}
          settlementResult={settlementResult}
          onSaved={chargesRefreshToken}
          isSaving={additionalChargesMutation.isPending}
          saveError={saveChargesError}
          onSave={(formState) => {
            setSaveChargesError(null)
            additionalChargesMutation.mutate(buildChargesPayload(formState))
          }}
        />
        {showLegacyActions && reservation.status === 'A_CONTROLER' && reservation.return_charges_confirmed_at && Number(reservation.return_delay_fee) + Number(reservation.return_fuel_fee) === 0 ? (
          <Button className="mt-3" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
            {t("professional.cloturer_la_location")}</Button>
        ) : null}
        {showLegacyActions && reservation.status === 'A_CONTROLER' && completeMutation.isError ? (
          <Notice title={t("professional.cloture_impossible")} message={toErrorState(completeMutation.error).message} />
        ) : null}
        {reservation.status === 'TERMINEE' && !reservation.invoice_pdf_available ? (
          <div className="mt-4">
            <button type="button" className={secondaryClass} disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
              {t("professional.reessayer_la_generation_de_la_facture")}</button>
            {completeMutation.isError ? <Notice title={t("professional.generation_impossible")} message={toErrorState(completeMutation.error).message} /> : null}
          </div>
        ) : null}
      </section>

      {showLegacyActions && (reservation.status === 'A_CONTROLER' || settlementResult !== null) ? (
        <ReservationClosureSection
          reservation={reservation}
          isSettling={depositSettlementMutation.isPending}
          settleError={depositSettlementMutation.isError ? toErrorState(depositSettlementMutation.error).message : null}
          settlementResult={settlementResult}
          showConfirm={showSettleConfirm}
          onRequestConfirm={() => setShowSettleConfirm(true)}
          onCancelConfirm={() => setShowSettleConfirm(false)}
          onConfirm={() => depositSettlementMutation.mutate()}
        />
      ) : null}

    </section>
  )
}

function ReservationClosureSection({
  reservation,
  isSettling,
  settleError,
  settlementResult,
  showConfirm,
  onRequestConfirm,
  onCancelConfirm,
  onConfirm,
}: {
  reservation: {
    status: string
    rental_amount: string
    deposit_amount: string
    deposit_status: string | null
    return_charges_confirmed_at: string | null
    return_delay_fee: string | null
    return_fuel_fee: string | null
    additional_charges: Array<{ charge_type: ReservationAdditionalChargeType; amount: string; justification: string; status: string }>
  }
  isSettling: boolean
  settleError: string | null
  settlementResult: ReservationDepositSettlementResponse | null
  showConfirm: boolean
  onRequestConfirm: () => void
  onCancelConfirm: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const provisionalCharges = reservation.additional_charges.filter((charge) => charge.status === 'PROVISOIRE')
  const hasInvalidCharges = provisionalCharges.some((charge) => {
    const amount = Number(charge.amount)
    return !Number.isFinite(amount) || amount < 0
  })

  // Miroir du calcul backend (tâche 4.2) : lignes provisoires, sinon frais historiques confirmés.
  let chargesTotal = provisionalCharges.reduce((sum, charge) => {
    const amount = Number(charge.amount)
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum
  }, 0)
  if (provisionalCharges.length === 0 && reservation.return_charges_confirmed_at) {
    chargesTotal = Math.max(Number(reservation.return_delay_fee) || 0, 0) + Math.max(Number(reservation.return_fuel_fee) || 0, 0)
  }

  const depositAmount = Number(reservation.deposit_amount) || 0
  const retainedAmount = Math.min(chargesTotal, depositAmount)
  const amountToRelease = Math.max(depositAmount - retainedAmount, 0)
  const overDeposit = Math.max(chargesTotal - depositAmount, 0)

  const isDepositSettleable = reservation.deposit_status === 'AUTORISEE' || reservation.deposit_status === 'A_VERIFIER'
  const chargesConfirmed = reservation.return_charges_confirmed_at !== null
  const canSettle =
    reservation.status === 'A_CONTROLER'
    && isDepositSettleable
    && chargesConfirmed
    && !hasInvalidCharges
    && !isSettling
    && settlementResult === null

  let disabledReason: string | null = null
  if (settlementResult === null) {
    if (reservation.status !== 'A_CONTROLER') {
      disabledReason = 'La réservation doit être au statut « À contrôler ».'
    } else if (!isDepositSettleable) {
      disabledReason = 'La caution ne peut pas être traitée (aucune préautorisation active).'
    } else if (!chargesConfirmed) {
      disabledReason = 'Enregistrez d\u2019abord les frais supplémentaires (même à 0 €).'
    } else if (hasInvalidCharges) {
      disabledReason = 'Des frais enregistrés sont invalides ; corrigez-les avant de clôturer.'
    }
  }

  const settledStatusLabel =
    settlementResult?.deposit_status === 'CAPTUREE'
      ? 'Caution capturée (retenue appliquée)'
      : settlementResult?.deposit_status === 'LIBEREE'
        ? 'Caution libérée intégralement'
        : settlementResult?.deposit_status ?? ''

  return (
    <Card header={<h2 className="text-xl font-semibold text-black">{t("professional.cloture_de_la_reservation")}</h2>}>
      <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm md:grid-cols-2">
          <Field label={t("professional.montant_de_location_initial")} value={formatCurrency(reservation.rental_amount)} />
          <Field label={t("professional.caution_preautorisee")} value={formatCurrency(reservation.deposit_amount)} />
          <Field label={t("professional.total_des_frais_supplementaires")} value={formatCurrency(chargesTotal.toFixed(2))} />
          <Field label={t("professional.montant_a_retenir")} value={formatCurrency(retainedAmount.toFixed(2))} />
          <Field label={t("professional.solde_a_liberer")} value={formatCurrency(amountToRelease.toFixed(2))} />
          <Field label={t("professional.depassement_eventuel_de_la_caution")} value={formatCurrency(overDeposit.toFixed(2))} />
        </div>

        {settlementResult ? (
          <div className="space-y-3">
            <Notice title={t("professional.caution_regularisee_resultat_confirme_par_stripe")}
              message={settledStatusLabel}
            />
            <div className="grid gap-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-sm md:grid-cols-2">
              <Field label={t("professional.montant_capture_confirme")} value={formatCurrency(settlementResult.captured_amount)} />
              <Field label={t("professional.montant_libere_confirme")} value={formatCurrency(settlementResult.released_amount)} />
              <Field label={t("professional.frais_retenus")} value={formatCurrency(settlementResult.charges_total)} />
              <Field label={t("professional.depassement_de_caution")} value={formatCurrency(settlementResult.over_deposit_amount)} />
            </div>
            {settlementResult.stripe_payment_intent_id ? (
              <p className="text-xs text-gray-500">{t("professional.transaction_stripe")} {settlementResult.stripe_payment_intent_id}</p>
            ) : null}
          </div>
        ) : null}

        {settleError ? (
          <Notice title={t("professional.cloture_impossible")}
            message={`${settleError} La caution n\u2019a pas été traitée et la réservation n\u2019est pas clôturée.`}
          />
        ) : null}

        {showConfirm && settlementResult === null ? (
          <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
            <p className="text-sm font-semibold text-[#92400E]">{t("professional.confirmer_la_regularisation_de_la_caution")}</p>
            <ul className="mt-2 space-y-1 text-sm text-[#78350F]">
              <li>{t("professional.frais_supplementaires_2")} {formatCurrency(chargesTotal.toFixed(2))}</li>
              <li>{t("professional.montant_a_retenir_capture_stripe")} {formatCurrency(retainedAmount.toFixed(2))}</li>
              <li>{t("professional.solde_a_liberer_2")} {formatCurrency(amountToRelease.toFixed(2))}</li>
              {overDeposit > 0 ? <li>{t("professional.depassement_a_facturer_separement")} {formatCurrency(overDeposit.toFixed(2))}</li> : null}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={isSettling} onClick={onConfirm}>
                {isSettling ? t("professional.traitement_en_cours") : t("professional.confirmer")}
              </Button>
              <Button variant="secondary" disabled={isSettling} onClick={onCancelConfirm}>
                {t("client.annuler")}</Button>
            </div>
          </div>
        ) : null}

        {settlementResult === null && !showConfirm ? (
          <div className="space-y-2">
            <Button disabled={!canSettle} onClick={onRequestConfirm}>
              {isSettling ? t("professional.traitement_en_cours") : t("professional.valider_et_cloturer")}
            </Button>
            {disabledReason ? <p className="text-sm text-gray-500">{disabledReason}</p> : null}
          </div>
        ) : null}
      </div>
    </Card>
  )
}
