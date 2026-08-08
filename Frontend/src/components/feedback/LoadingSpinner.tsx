export default function LoadingSpinner() {
  return (
    <div role="status" aria-label="Chargement" className="inline-flex items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      <span className="sr-only">Chargement</span>
    </div>
  )
}