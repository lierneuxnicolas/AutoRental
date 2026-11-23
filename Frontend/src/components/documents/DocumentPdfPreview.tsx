export default function DocumentPdfPreview({
  url, title, className,
}: { url: string; title: string; className: string }) {
  return (
    <div className="w-full space-y-2">
      <iframe
        title={title}
        src={url}
        referrerPolicy="no-referrer"
        className={className + ' w-full rounded-lg border border-slate-200'}
      />
      <a href={url} download="document.pdf" className="text-sm font-medium text-slate-700 underline">
        Télécharger le PDF
      </a>
    </div>
  )
}
