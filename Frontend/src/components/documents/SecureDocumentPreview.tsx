import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'

interface SecureDocumentPreviewProps {
  documentId: number
  title: string
  fetchFile: (documentId: number) => Promise<Blob>
}

async function getErrorMessage(error: unknown): Promise<string> {
  if (axios.isAxiosError(error)) {
    let responseData: unknown = error.response?.data
    if (responseData instanceof Blob) {
      try {
        responseData = JSON.parse(await responseData.text()) as unknown
      } catch {
        responseData = undefined
      }
    }

    const detail = (responseData as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }

    if (error.response?.status === 404) {
      return 'Le fichier de ce document est introuvable dans le stockage.'
    }
  }
  return 'Le document n’a pas pu être chargé.'
}

export default function SecureDocumentPreview({
  documentId,
  title,
  fetchFile,
}: SecureDocumentPreviewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const fileMutation = useMutation({
    mutationFn: () => fetchFile(documentId),
  })
  const resetFileMutation = fileMutation.reset
  const isOpenRef = useRef(false)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!previewUrl) {
      return undefined
    }
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const closePreview = useCallback(() => {
    isOpenRef.current = false
    setIsOpen(false)
    setPreviewUrl(null)
    setPreviewError(null)
    resetFileMutation()
  }, [resetFileMutation])

  const openPreview = () => {
    isOpenRef.current = true
    resetFileMutation()
    setPreviewError(null)
    setIsOpen(true)
    void fileMutation.mutateAsync().then((file) => {
      if (isOpenRef.current) {
        setPreviewUrl(URL.createObjectURL(file))
      }
    }).catch(async (error: unknown) => {
      if (isOpenRef.current) {
        setPreviewError(await getErrorMessage(error))
      }
    })
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePreview()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closePreview, isOpen])

  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        onClick={openPreview}
      >
        Voir le document
      </Button>

      {isOpen ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePreview()
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-preview-title"
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <h2 id="document-preview-title" className="text-lg font-semibold text-[#1F2937]">
                {title}
              </h2>
              <Button variant="secondary" size="sm" onClick={closePreview}>
                Fermer
              </Button>
            </header>

            <div className="min-h-64 overflow-auto p-4 sm:p-6">
              {fileMutation.isPending ? (
                <div className="flex min-h-64 items-center justify-center">
                  <LoadingSpinner size="lg" aria-label="Chargement du document" />
                </div>
              ) : null}
              {fileMutation.isError ? (
                <Alert
                  variant="danger"
                  title="Consultation impossible"
                  message={previewError || 'Le document n’a pas pu être chargé.'}
                />
              ) : null}
              {previewUrl && fileMutation.data?.type.startsWith('image/') ? (
                <img
                  src={previewUrl}
                  alt={title}
                  className="mx-auto max-h-[75vh] max-w-full rounded-2xl object-contain"
                />
              ) : null}
              {previewUrl && fileMutation.data?.type === 'application/pdf' ? (
                <iframe
                  src={previewUrl}
                  title={title}
                  className="h-[75vh] w-full rounded-2xl border border-slate-200"
                />
              ) : null}
              {previewUrl
                && !fileMutation.data?.type.startsWith('image/')
                && fileMutation.data?.type !== 'application/pdf' ? (
                  <Alert
                    variant="warning"
                    title="Format non pris en charge"
                    message="Ce document ne peut pas être affiché dans l’aperçu."
                  />
                ) : null}
            </div>
          </section>
        </div>
        , document.body
      ) : null}
    </>
  )
}
