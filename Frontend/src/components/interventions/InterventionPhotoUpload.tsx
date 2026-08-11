import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import { uploadMechanicInterventionPhoto } from '../../services/mechanicInterventionService'
import type { MechanicInterventionPhotoResponse } from '../../types/mechanicIntervention'

export interface InterventionPhotoUploadProps {
  interventionId: number
  onUploadSuccess?: (photo: MechanicInterventionPhotoResponse) => void
}

interface ApiErrorPayload {
  detail?: unknown
  non_field_errors?: unknown
  file?: unknown
  caption?: unknown
}

function getFirstMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
  }

  if (Array.isArray(value)) {
    const firstMessage = value.find((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (firstMessage) {
      return firstMessage
    }
  }

  return null
}

function extractUploadErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as ApiErrorPayload | string | undefined

    if (typeof payload === 'string' && payload.trim().length > 0) {
      return payload
    }

    if (payload && typeof payload === 'object') {
      const detailMessage = getFirstMessage(payload.detail)
      if (detailMessage) {
        return detailMessage
      }

      const nonFieldErrorMessage = getFirstMessage(payload.non_field_errors)
      if (nonFieldErrorMessage) {
        return nonFieldErrorMessage
      }

      const fileErrorMessage = getFirstMessage(payload.file)
      if (fileErrorMessage) {
        return fileErrorMessage
      }

      const captionErrorMessage = getFirstMessage(payload.caption)
      if (captionErrorMessage) {
        return captionErrorMessage
      }
    }

    if (!error.response) {
      return 'Impossible de joindre le serveur. Verifiez votre connexion et reessayez.'
    }
  }

  return "La photo n'a pas pu etre envoyee. Veuillez reessayer."
}

export default function InterventionPhotoUpload({ interventionId, onUploadSuccess }: InterventionPhotoUploadProps) {
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return null
    }

    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error('NO_FILE_SELECTED')
      }

      return uploadMechanicInterventionPhoto(interventionId, {
        file: selectedFile,
        caption: caption.trim() || undefined,
      })
    },
    onSuccess: (photo) => {
      setUploadError(null)
      setSuccessMessage('Photo envoyee avec succes.')
      setSelectedFile(null)
      setCaption('')

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      onUploadSuccess?.(photo)
    },
    onError: (error) => {
      setSuccessMessage(null)
      setUploadError(extractUploadErrorMessage(error))
    },
  })

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null

    setSelectedFile(nextFile)
    setUploadError(null)
    setSuccessMessage(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (uploadMutation.isPending || !selectedFile) {
      return
    }

    setUploadError(null)
    setSuccessMessage(null)
    void uploadMutation.mutateAsync()
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      {uploadError ? <Alert variant="danger" title="Envoi impossible" message={uploadError} /> : null}
      {successMessage ? <Alert variant="success" title="Photo envoyee" message={successMessage} /> : null}

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <label htmlFor={fileInputId} className="block text-sm font-medium text-[#1F2937]">
            Selectionner une image
          </label>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept="image/*"
            className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-slate-600 shadow-sm file:mr-4 file:rounded-full file:border-0 file:bg-[#DBEAFE] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#2563EB]"
            onChange={handleFileChange}
          />
          {selectedFile ? <p className="text-sm text-slate-500">Fichier selectionne : {selectedFile.name}</p> : null}
        </div>

        {previewUrl ? (
          <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]">
            <img src={previewUrl} alt="Previsualisation de la photo" className="h-52 w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-52 items-center justify-center rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 text-center text-sm text-slate-500">
            Aucune image selectionnee.
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="intervention-photo-caption" className="block text-sm font-medium text-[#1F2937]">
            Legende (optionnel)
          </label>
          <input
            id="intervention-photo-caption"
            type="text"
            value={caption}
            onChange={(event) => {
              setCaption(event.target.value)
              setUploadError(null)
              setSuccessMessage(null)
            }}
            placeholder="Ex: dommage aile avant gauche"
            className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </div>

        <Button type="submit" className="w-full sm:w-auto" disabled={uploadMutation.isPending || !selectedFile}>
          {uploadMutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" aria-label="Envoi de la photo" />
              Envoi en cours...
            </span>
          ) : (
            'Envoyer la photo'
          )}
        </Button>
      </form>
    </div>
  )
}
