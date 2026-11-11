import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import SecureDocumentPreview from '../../components/documents/SecureDocumentPreview'
import {
  getManagementDocumentById,
  getManagementDocumentFile,
  rejectManagementDocument,
  validateManagementDocument,
} from '../../services/managementDocumentService'
import type {
  DocumentStatus,
  DocumentType,
  DrivingLicenseTransmission,
  ManagerClientDocumentDetail,
} from '../../types/managementDocument'

interface ErrorPayload {
  detail?: string
  message?: string
  reason?: string[]
  [field: string]: unknown
}

function toErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur est survenue. Veuillez reessayer.'
  }

  const payload = error.response?.data as ErrorPayload | undefined

  if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  if (Array.isArray(payload?.reason) && payload.reason.length > 0) {
    return payload.reason.join(' ')
  }

  const fieldErrors = payload
    ? Object.values(payload)
      .filter((value): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string'))
      .flat()
    : []
  if (fieldErrors.length > 0) {
    return fieldErrors.join(' ')
  }

  return 'Une erreur est survenue. Veuillez reessayer.'
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

function mapStatus(status: DocumentStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'EN_ATTENTE':
      return { label: 'En attente', variant: 'warning' }
    case 'VALIDE':
      return { label: 'Validé', variant: 'success' }
    case 'REFUSE':
      return { label: 'Refusé', variant: 'danger' }
    case 'EXPIRE':
      return { label: 'Expiré', variant: 'danger' }
  }
}

function mapDocumentType(type: DocumentType): string {
  switch (type) {
    case 'CARTE_IDENTITE':
      return 'Carte d’identité'
    case 'PERMIS_CONDUIRE':
      return 'Permis de conduire'
  }
}

function canManageDocument(document: ManagerClientDocumentDetail): boolean {
  return document.is_active && (document.status === 'EN_ATTENTE'
    || (document.document_type === 'CARTE_IDENTITE' && document.status === 'VALIDE')
    || (document.document_type === 'PERMIS_CONDUIRE' && document.status === 'VALIDE'))
}

function canRejectDocument(document: ManagerClientDocumentDetail): boolean {
    return document.status === 'EN_ATTENTE'
}

function getBirthDateState(value: string): { today: string; valid: boolean; underage: boolean } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? ''
  const today = `${part('year')}-${part('month')}-${part('day')}`
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return { today, valid: false, underage: false }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const birth = new Date(0)
  birth.setUTCFullYear(year, month - 1, day)
  const valid = year > 0 && birth.getUTCFullYear() === year && birth.getUTCMonth() === month - 1
    && birth.getUTCDate() === day && value <= today
  const thresholdYear = Number(part('year')) - 21
  const thresholdMonth = Number(part('month'))
  const thresholdDay = Math.min(Number(part('day')), new Date(Date.UTC(thresholdYear, thresholdMonth, 0)).getUTCDate())
  const threshold = `${thresholdYear}-${String(thresholdMonth).padStart(2, '0')}-${String(thresholdDay).padStart(2, '0')}`
  return { today, valid, underage: valid && value > threshold }
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-[#1F2937]">{value}</p>
    </div>
  )
}

function DocumentPreview({ document }: { document: ManagerClientDocumentDetail }) {
  if (!document.file) {
    return (
      <Alert
        variant="info"
        title="Apercu indisponible"
        message="Aucun fichier n'a ete retourne par l'API pour ce document."
      />
    )
  }

  return (
    <SecureDocumentPreview
      documentId={document.id}
      title={`Document ${mapDocumentType(document.document_type)}`}
      fetchFile={getManagementDocumentFile}
    />
  )
}

export default function ManagerDocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [showRejectBlock, setShowRejectBlock] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectReasonError, setRejectReasonError] = useState<string | null>(null)
  const [birthDateSelection, setBirthDateSelection] = useState<{ documentId: number; value: string }>({ documentId: 0, value: '' })
  const [verificationFields, setVerificationFields] = useState<{
    documentId: number
    firstName?: string
    lastName?: string
    documentNumber?: string
    expirationDate?: string
  }>({ documentId: 0 })
  const [licenseTransmissionSelection, setLicenseTransmissionSelection] = useState<{
    documentId: number
    value: DrivingLicenseTransmission | ''
  }>({ documentId: 0, value: '' })

  const documentId = Number(id)
  const isValidDocumentId = Number.isInteger(documentId) && documentId > 0
  const licenseTransmission = licenseTransmissionSelection.documentId === documentId
    ? licenseTransmissionSelection.value
    : undefined
  const detailQuery = useQuery({
    queryKey: ['management-document-detail', documentId],
    queryFn: () => getManagementDocumentById(documentId),
    enabled: isValidDocumentId,
  })
  const selectedTransmission = licenseTransmission ?? detailQuery.data?.driving_license_transmission ?? ''
  const verifiedBirthDate = birthDateSelection.documentId === documentId
    ? birthDateSelection.value
    : detailQuery.data?.verified_date_of_birth ?? ''
  const fields = verificationFields.documentId === documentId ? verificationFields : { documentId }
  const firstName = fields.firstName ?? detailQuery.data?.client_first_name ?? ''
  const lastName = fields.lastName ?? detailQuery.data?.client_last_name ?? ''
  const documentNumber = fields.documentNumber ?? detailQuery.data?.document_number ?? ''
  const expirationDate = fields.expirationDate ?? detailQuery.data?.expiration_date ?? ''
  const setField = (name: 'firstName' | 'lastName' | 'documentNumber' | 'expirationDate', value: string) => {
    setVerificationFields((current) => ({ ...(current.documentId === documentId ? current : { documentId }), [name]: value }))
  }

  const validateMutation = useMutation({
    mutationFn: () => {
      const document = detailQuery.data
      const common = { document_number: documentNumber, expiration_date: expirationDate }
      if (document?.document_type === 'CARTE_IDENTITE') {
        return validateManagementDocument(documentId, { ...common, first_name: firstName, last_name: lastName, verified_date_of_birth: verifiedBirthDate })
      }
      const transmission = selectedTransmission || undefined
      return validateManagementDocument(documentId, {
        ...common,
        ...(transmission ? { driving_license_transmission: transmission } : {}),
      })
    },
    onSuccess: async (updatedDocument) => {
      setActionError(null)
      setShowRejectBlock(false)
      queryClient.setQueryData(['management-document-detail', documentId], updatedDocument)
      setVerificationFields({ documentId: 0 })
      setBirthDateSelection({ documentId: 0, value: '' })
      setLicenseTransmissionSelection({ documentId: 0, value: '' })
      await queryClient.invalidateQueries({ queryKey: ['management-documents'] })
    },
    onError: (error) => {
      setActionError(toErrorMessage(error))
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => rejectManagementDocument(documentId, { reason: rejectReason.trim() }),
    onSuccess: async (updatedDocument) => {
      setActionError(null)
      setRejectReasonError(null)
      setShowRejectBlock(false)
      setRejectReason('')
      queryClient.setQueryData(['management-document-detail', documentId], updatedDocument)
      await queryClient.invalidateQueries({ queryKey: ['management-documents'] })
    },
    onError: (error) => {
      setActionError(toErrorMessage(error))
    },
  })

  if (!isValidDocumentId) {
    return (
      <section className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title="Document invalide"
          message="L'identifiant de document est invalide."
        />
        <Link to="/manager/documents" className="inline-flex">
          <Button variant="secondary">Retour a la liste</Button>
        </Link>
      </section>
    )
  }

  if (detailQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement du document" />
      </section>
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <section className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title="Chargement impossible"
          message={toErrorMessage(detailQuery.error)}
        />
        <div className="flex flex-wrap gap-2">
          <Link to="/manager/documents">
            <Button variant="secondary">Retour a la liste</Button>
          </Link>
          <Button variant="secondary" onClick={() => void detailQuery.refetch()}>
            Reessayer
          </Button>
        </div>
      </section>
    )
  }

  const document = detailQuery.data
  const status = mapStatus(document.status)
  const canAct = canManageDocument(document)
  const canReject = canRejectDocument(document)
  const isPendingAction = validateMutation.isPending || rejectMutation.isPending
  const isDrivingLicense = document.document_type === 'PERMIS_CONDUIRE'
  const isValidated = document.status === 'VALIDE'
  const hasChanges = documentNumber !== document.document_number
    || expirationDate !== (document.expiration_date ?? '')
    || (isDrivingLicense
      ? selectedTransmission !== (document.driving_license_transmission ?? '')
      : firstName !== document.client_first_name
        || lastName !== document.client_last_name
        || verifiedBirthDate !== (document.verified_date_of_birth ?? ''))
  const missingRequired = !documentNumber.trim() || !expirationDate
    || (isDrivingLicense ? !selectedTransmission : !verifiedBirthDate || !firstName.trim() || !lastName.trim())
  const birthDateState = getBirthDateState(verifiedBirthDate)
  return (
    <section className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {actionError ? <Alert variant="danger" title="Operation impossible" message={actionError} /> : null}

      <Card
        className="mx-auto w-full max-w-[900px]"
        header={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-semibold text-[#1F2937]">
              {isDrivingLicense ? 'Vérification du permis de conduire' : "Vérification de la carte d'identité"}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {document.client_profile_status === 'INCOMPLET' ? (
                <StatusBadge variant="warning" label="Profil incomplet" />
              ) : null}
              <StatusBadge variant={status.variant} label={status.label} />
            </div>
          </div>
        }
        footer={
          canAct ? (
            <div className="space-y-4">
              {!showRejectBlock ? (
                <h2 className="text-lg font-semibold text-[#1F2937]">Vérification des données officielles</h2>
              ) : null}
              {canReject && showRejectBlock ? (
                <div className="space-y-3">
                  <label htmlFor="reject-reason" className="block text-sm font-medium text-[#1F2937]">
                    Motif de refus<span className="ml-1 text-[#EF4444]">*</span>
                  </label>
                  <textarea
                    id="reject-reason"
                    rows={4}
                    className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                    placeholder="Décrivez le motif de refus"
                    value={rejectReason}
                    onChange={(event) => {
                      setRejectReason(event.target.value)
                      if (rejectReasonError) setRejectReasonError(null)
                    }}
                  />
                  {rejectReasonError ? <p className="text-sm text-[#EF4444]">{rejectReasonError}</p> : null}
                </div>
              ) : null}
              {!showRejectBlock && isDrivingLicense ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-[#1F2937]">Type de permis vérifié</legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                      <input
                        type="radio"
                        disabled={isPendingAction}
                        name={`license-transmission-${documentId}`}
                        value="MANUAL_AND_AUTOMATIC"
                        checked={selectedTransmission === 'MANUAL_AND_AUTOMATIC'}
                        className="shrink-0 accent-violet-600"
                        onChange={() => setLicenseTransmissionSelection({ documentId, value: 'MANUAL_AND_AUTOMATIC' })}
                      />
                      Permis manuel
                    </label>
                    <label className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                      <input
                        type="radio"
                        disabled={isPendingAction}
                        name={`license-transmission-${documentId}`}
                        value="AUTOMATIC_ONLY"
                        checked={selectedTransmission === 'AUTOMATIC_ONLY'}
                        className="shrink-0 accent-violet-600"
                        onChange={() => setLicenseTransmissionSelection({ documentId, value: 'AUTOMATIC_ONLY' })}
                      />
                      Permis automatique
                    </label>
                  </div>
                </fieldset>
              ) : null}
              {!showRejectBlock ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {!isDrivingLicense ? (
                    <>
                      <Input label="Nom" required disabled={isPendingAction} value={lastName} onChange={(event) => setField('lastName', event.target.value)} />
                      <Input label="Prénom" required disabled={isPendingAction} value={firstName} onChange={(event) => setField('firstName', event.target.value)} />
                      <div>
                        <Input label="Date de naissance vérifiée" type="date" required max={birthDateState.today} disabled={isPendingAction} value={verifiedBirthDate} onChange={(event) => setBirthDateSelection({ documentId, value: event.target.value })} />
                        {birthDateState.underage ? <p className="mt-1 text-sm text-red-600">Client non éligible à la location : âge minimum de 21 ans.</p> : null}
                      </div>
                    </>
                  ) : null}
                  <Input label={isDrivingLicense ? 'Numéro de permis' : "Numéro de carte d'identité"} required disabled={isPendingAction} value={documentNumber} onChange={(event) => setField('documentNumber', event.target.value)} />
                  <Input label="Date d’expiration" type="date" required disabled={isPendingAction} value={expirationDate} onChange={(event) => setField('expirationDate', event.target.value)} />
                </div>
              ) : null}

              <div className={`grid grid-cols-1 gap-3 ${canReject ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
                {canReject && showRejectBlock ? (
                  <>
                    <Button
                      variant="danger"
                      className="w-full"
                      disabled={isPendingAction}
                      onClick={() => {
                        setActionError(null)
                        if (!rejectReason.trim()) {
                          setRejectReasonError('Le motif de refus est obligatoire.')
                          return
                        }
                        setRejectReasonError(null)
                        void rejectMutation.mutateAsync()
                      }}
                    >
                      {rejectMutation.isPending ? 'Refus en cours...' : 'Confirmer le refus'}
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={isPendingAction}
                      onClick={() => {
                        setShowRejectBlock(false)
                        setRejectReason('')
                        setRejectReasonError(null)
                      }}
                    >
                      Annuler
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      className="w-full"
                      variant="success"
                      disabled={isPendingAction || missingRequired || (!isDrivingLicense && !birthDateState.valid) || (isValidated && !hasChanges)}
                      onClick={() => {
                        setActionError(null)

                        if (isDrivingLicense && !selectedTransmission) {
                          setActionError('Sélectionnez le type de permis vérifié avant validation.')
                          return
                        }

                        if (!isValidated || hasChanges) {
                          void validateMutation.mutateAsync()
                        }
                      }}
                    >
                      {validateMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <LoadingSpinner size="sm" aria-label="Validation en cours" />
                          Validation en cours...
                        </span>
                      ) : isValidated
                        ? hasChanges ? 'Enregistrer les modifications' : isDrivingLicense ? '✓ Permis de conduire validé' : "✓ Carte d'identité validée"
                        : isDrivingLicense ? 'Valider le permis de conduire' : "Valider la carte d'identité"}
                    </Button>

                    {canReject ? (
                      <Button
                        className="w-full"
                        variant="danger"
                        disabled={isPendingAction}
                        onClick={() => {
                          setActionError(null)
                          setShowRejectBlock(true)
                        }}
                      >
                        {isDrivingLicense ? 'Refuser le permis de conduire' : "Refuser la carte d'identité"}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <DetailField label="Date d’envoi" value={formatDateTime(document.uploaded_at)} />
            <div className="max-w-full">
              <DocumentPreview document={document} />
            </div>
          </div>

          {!canAct ? (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <DetailField label="Date de décision" value={formatDateTime(document.validated_at)} />
              {document.status === 'REFUSE' ? (
                <DetailField label="Motif de refus" value={document.rejection_reason || 'Aucun motif indiqué'} />
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>
      <div className="mx-auto flex w-full max-w-[900px] justify-end">
        <Link to="/manager/documents">
          <Button variant="secondary">Retour à la liste</Button>
        </Link>
      </div>
    </section>
  )
}