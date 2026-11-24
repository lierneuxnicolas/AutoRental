import { useTranslation } from 'react-i18next'
interface PrivateAreaPageProps {
  title: string
  roleLabel: string
  sections: string[]
}

export default function PrivateAreaPage({ title, roleLabel, sections }: PrivateAreaPageProps) {
  const { t } = useTranslation()
  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#2563EB]">{t("professional.espace_role", { role: roleLabel })}</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#0F172A]">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          {t("professional.cette_page_est_accessible_uniquement_aux_utilisateurs_authentifies_de_ce_role")}
        </p>
      </header>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-[#0F172A]">{t("professional.rubriques")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <article key={section} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-800">{section}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
