import type { LucideIcon } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

interface FeaturePlaceholderPageProps {
  title: string
  description: string
  icon: LucideIcon
  backLink: string
  backLabel: string
}

export default function FeaturePlaceholderPage({
  title,
  description,
  icon: Icon,
  backLink,
  backLabel,
}: FeaturePlaceholderPageProps) {
  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-semibold text-[#0F172A]">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
      </header>

      <Card className="p-2">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-blue-50 p-3 text-[#2563EB]">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#0F172A]">{title}</h2>
              <p className="mt-2 text-sm text-slate-600">Cette fonctionnalité sera disponible prochainement.</p>
            </div>
          </div>

          <Link to={backLink}>
            <Button variant="secondary" className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
          </Link>
        </div>
      </Card>
    </section>
  )
}
