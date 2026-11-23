const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function documentPreviewKind(mime: string | undefined): 'image' | 'pdf' | null {
  const type = mime?.toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  return type && imageTypes.has(type) ? 'image' : null
}
