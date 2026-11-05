import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Input from '../ui/Input'
import type { ClientDocument } from '../../types/auth'
import { createClientDocument } from '../../services/authService'

const documentSchema = z.object({
  document_type: z.enum(['CARTE_IDENTITE', 'PERMIS_CONDUIRE']),
  document_number: z.string().trim().min(1, 'Le numéro de document est obligatoire.'),
  expiration_date: z.string().trim().min(1, 'La date d’expiration est obligatoire.'),
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

function toDocumentTitle(documentType: DocumentUploadProps['documentType']): string {
  return documentType === 'CARTE_IDENTITE' ? 'Carte d’identité' : 'Permis de conduire'
}

function toDocumentNumberLabel(documentType: DocumentUploadProps['documentType']): string {
  return documentType === 'CARTE_IDENTITE'
    ? 'Numéro de carte d’identité'
    : 'Numéro de permis de conduire'
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { detail?: unknown; file?: unknown } | undefined
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail
    }
    if (Array.isArray(payload?.file) && payload.file.length > 0) {
      return String(payload.file[0])
    }
  }
  return 'Le document n’a pas pu être envoyé. Veuillez réessayer.'
}

export default function DocumentUpload({ documentType, existingDocument, onSuccess }: DocumentUploadProps) {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const title = toDocumentTitle(documentType)

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<DocumentUploadValues>({
    resolver: zodResolver(documentSchema) as Resolver<DocumentUploadValues>,
    defaultValues: {
      document_type: documentType,
      document_number: '',
      expiration_date: '',
      file: undefined as unknown as File,
    },
  })

  const closeForm = () => {
    setIsOpen(false)
    setServerError(null)
    setSelectedFileName(null)
    reset({
      document_type: documentType,
      document_number: '',
      expiration_date: '',
      file: undefined as unknown as File,
    })
  }

  const createMutation = useMutation({
    mutationFn: async (values: DocumentUploadValues) => {
      const formData = new FormData()
      formData.append('document_type', values.document_type)
      formData.append('document_number', values.document_number.trim())
      formData.append('expiration_date', values.expiration_date)
      formData.append('file', values.file)
      return createClientDocument(formData)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['client-documents'] }),
        queryClient.invalidateQueries({ queryKey: ['client-profile-progress'] }),
        queryClient.invalidateQueries({ queryKey: ['client-profile-me'] }),
      ])
      closeForm()
      onSuccess?.()
    },
    onError: (error) => setServerError(getErrorMessage(error)),
  })

  const submit = (values: DocumentUploadValues) => {
    setServerError(null)
    void createMutation.mutateAsync(values)
  }

  return (
    <>
      <Button className="w-full" onClick={() => setIsOpen(true)}>
        {existingDocument ? 'Remplacer le document' : 'Ajouter le document'}
      </Button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !createMutation.isPending) {
              closeForm()
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-upload-title"
            className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <h2 id="document-upload-title" className="mb-5 text-xl font-semibold text-[#1F2937]">
              {existingDocument ? 'Remplacer' : 'Ajouter'} — {title}
            </h2>

            {serverError ? (
              <Alert className="mb-4" variant="danger" title="Envoi impossible" message={serverError} />
            ) : null}

            <form className="space-y-4" onSubmit={handleSubmit(submit)} noValidate>
              <Input
                label={toDocumentNumberLabel(documentType)}
                placeholder={toDocumentNumberLabel(documentType)}
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
                <label className="block text-sm font-medium text-[#1F2937]" htmlFor={`${documentType}-replacement-file`}>
                  Fichier du document
                </label>
                <input
                  id={`${documentType}-replacement-file`}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-slate-600 shadow-sm file:mr-4 file:rounded-full file:border-0 file:bg-[#EDE9FE] file:px-3 file:py-2 file:text-sm file:font-medium file:text-violet-700"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    setSelectedFileName(file?.name ?? null)
                    setValue('file', file ?? (undefined as unknown as File), { shouldValidate: true })
                  }}
                />
                {selectedFileName ? (
                  <p className="text-sm text-slate-500">Fichier sélectionné : {selectedFileName}</p>
                ) : null}
                {errors.file?.message ? <p className="text-sm text-red-600">{errors.file.message}</p> : null}
              </div>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={createMutation.isPending}
                  onClick={closeForm}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" aria-label="Envoi du document" />
                      Envoi en cours...
                    </>
                  ) : (
                    'Envoyer pour validation'
                  )}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
