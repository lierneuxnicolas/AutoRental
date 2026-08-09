import { useMemo, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Input from '../ui/Input'
import type { ClientDocument } from '../../types/auth'
import { createClientDocument } from '../../services/authService'

const documentSchema = z.object({
  document_type: z.enum(['CARTE_IDENTITE', 'PERMIS_CONDUIRE']),
  document_number: z.string().trim().min(1, 'Le numéro de document est obligatoire.'),
  expiration_date: z.string().trim().optional().default(''),
  file: z
    .instanceof(File, { message: 'Sélectionnez un fichier.' })
    .refine((file) => file.size > 0, 'Le fichier est vide.'),
})

type DocumentUploadValues = z.infer<typeof documentSchema>

interface DocumentUploadProps {
  documentType: 'CARTE_IDENTITE' | 'PERMIS_CONDUIRE'
  existingDocument?: ClientDocument
  onSuccess?: () => void
}

function toDocumentTitle(documentType: 'CARTE_IDENTITE' | 'PERMIS_CONDUIRE'): string {
  return documentType === 'CARTE_IDENTITE' ? 'Carte d’identité' : 'Permis de conduire'
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Non renseignée'
  }

  return value.slice(0, 10).split('-').reverse().join('/')
}

export default function DocumentUpload({ documentType, existingDocument, onSuccess }: DocumentUploadProps) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)

  const title = useMemo(() => toDocumentTitle(documentType), [documentType])

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DocumentUploadValues>({
    resolver: zodResolver(documentSchema) as Resolver<DocumentUploadValues>,
    defaultValues: {
      document_type: documentType,
      document_number: existingDocument?.document_number ?? '',
      expiration_date: existingDocument?.expiration_date ? existingDocument.expiration_date.slice(0, 10) : '',
      file: undefined as unknown as File,
    },
  })

  const createMutation = useMutation({
    mutationFn: async (values: DocumentUploadValues) => {
      const formData = new FormData()
      formData.append('document_type', values.document_type)
      formData.append('document_number', values.document_number.trim())
      formData.append('file', values.file)

      if (values.expiration_date) {
        formData.append('expiration_date', values.expiration_date)
      }

      return createClientDocument(formData)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['client-documents'] }),
        queryClient.invalidateQueries({ queryKey: ['client-profile-progress'] }),
      ])
      setServerError(null)
      setSuccessMessage('Votre document a bien été envoyé. Il sera validé par un gestionnaire.')
      reset({
        document_type: documentType,
        document_number: '',
        expiration_date: '',
        file: undefined as unknown as File,
      })
      setSelectedFileName(null)
      onSuccess?.()
    },
    onError: (error) => {
      setSuccessMessage(null)
      setServerError(extractApiErrorMessage(error))
    },
  })

  const onSubmit = (values: DocumentUploadValues) => {
    setServerError(null)
    setSuccessMessage(null)
    void createMutation.mutateAsync(values)
  }

  return (
    <div className="space-y-4">
      {existingDocument ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#111827]">{title}</p>
              <p className="mt-1 text-sm text-slate-600">Statut : {statusLabel(existingDocument.status)}</p>
            </div>
            <div className="text-sm text-slate-500">
              Envoyé le {formatDate(existingDocument.uploaded_at)}
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <p className="font-medium text-[#1F2937]">Numéro</p>
              <p>{existingDocument.document_number}</p>
            </div>
            <div>
              <p className="font-medium text-[#1F2937]">Expiration</p>
              <p>{existingDocument.expiration_date ? formatDate(existingDocument.expiration_date) : 'Non renseignée'}</p>
            </div>
            {existingDocument.rejection_reason ? (
              <div className="sm:col-span-2">
                <p className="font-medium text-[#1F2937]">Motif de refus</p>
                <p>{existingDocument.rejection_reason}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#BFDBFE] bg-[#F8FBFF] p-4 text-sm text-slate-600">
          Aucun document transmis pour {title.toLowerCase()}.
        </div>
      )}

      {serverError ? <Alert variant="danger" title="Envoi impossible" message={serverError} /> : null}
      {successMessage ? <Alert variant="success" title="Document envoyé" message={successMessage} /> : null}

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label="Numéro du document"
          placeholder="Numéro figurant sur le document"
          error={errors.document_number?.message}
          {...register('document_number')}
        />

        <Input
          label="Date d’expiration"
          type="date"
          error={errors.expiration_date?.message}
          {...register('expiration_date')}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#1F2937]" htmlFor={`${documentType}-file`}>
            Fichier
          </label>
          <input
            id={`${documentType}-file`}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-slate-600 shadow-sm file:mr-4 file:rounded-full file:border-0 file:bg-[#DBEAFE] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#2563EB]"
            onChange={(event) => {
              const nextFile = event.target.files?.[0]
              if (nextFile) {
                setSelectedFileName(nextFile.name)
                setValue('file', nextFile, { shouldValidate: true })
              } else {
                setSelectedFileName(null)
                setValue('file', undefined as unknown as File, { shouldValidate: true })
              }
            }}
          />
          {selectedFileName ? <p className="text-sm text-slate-500">Fichier sélectionné : {selectedFileName}</p> : null}
          {errors.file?.message ? <p className="text-sm text-[#EF4444]">{errors.file.message}</p> : null}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" aria-label="Envoi du document" />
              Envoi en cours...
            </span>
          ) : (
            existingDocument ? 'Remplacer le document' : 'Ajouter le document'
          )}
        </Button>
      </form>
    </div>
  )
}

function statusLabel(status: ClientDocument['status']): string {
  switch (status) {
    case 'VALIDE':
      return 'Validé'
    case 'REFUSE':
      return 'Refusé'
    case 'EXPIRE':
      return 'Expiré'
    case 'EN_ATTENTE':
    default:
      return 'En attente de validation'
  }
}

function extractApiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Le fichier n’a pas pu être envoyé. Veuillez réessayer.'
}
