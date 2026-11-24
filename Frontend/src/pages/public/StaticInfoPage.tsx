import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { Fragment } from 'react'
import { Check } from 'lucide-react'

export interface StaticInfoValueBlock {
  title: string
  description: string
}

export interface StaticInfoSection {
  heading: string
  headingStyle?: 'check' | 'emphasis' | 'plain'
  paragraphs?: string[]
  valueBlocks?: StaticInfoValueBlock[]
  addressLines?: string[]
  note?: string
  content?: ReactNode
}

interface StaticInfoPageProps {
  title: string
  description?: string
  paragraphs?: string[]
  sections?: StaticInfoSection[]
  checkClassName?: string
  footerNote?: string
  groups?: { id: string; title: string; sections: StaticInfoSection[]; note?: string }[]
}

function renderBoldText(text: string) {
  const parts = text.split('**')
  return parts.map((part, index) =>
    index % 2 === 1 ? <strong key={index} className="font-semibold text-[#1F2937]">{part}</strong> : <Fragment key={index}>{part}</Fragment>,
  )
}

function StaticInfoSectionBlock({ section, checkClassName, headingLevel: Heading = 'h2' }: {
  section: StaticInfoSection
  checkClassName: string
  headingLevel?: 'h2' | 'h3'
}) {
  const { t } = useTranslation()
  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50/60 px-5 py-5 sm:px-6 sm:py-6">
      {section.headingStyle === 'emphasis' ? (
        <Heading className="text-center text-lg font-bold tracking-tight text-[#1F2937] sm:text-xl">
          — {t(section.heading)} —
        </Heading>
      ) : section.headingStyle === 'plain' ? (
        <Heading className="text-lg font-bold tracking-tight text-[#1F2937] sm:text-xl">{t(section.heading)}</Heading>
      ) : (
        <Heading className="flex items-center gap-2 text-lg font-bold tracking-tight text-[#1F2937] sm:text-xl">
          <Check className={checkClassName} aria-hidden="true" />
          {t(section.heading)}
        </Heading>
      )}

      <div className="mt-4 space-y-3">
        {section.content}

        {section.addressLines ? (
          <div className="space-y-1 text-base leading-7 text-slate-600 sm:text-lg">
            {section.addressLines.map((line) => (
              <p key={line}>{renderBoldText(t(line))}</p>
            ))}
          </div>
        ) : null}

        {section.paragraphs?.map((paragraph) => (
          <p key={paragraph} className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
            {renderBoldText(t(paragraph))}
          </p>
        ))}

        {section.valueBlocks ? (
          <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-12">
            {section.valueBlocks.map((block) => (
              <div key={block.title}>
                <p className="font-bold text-[#1F2937]">{t(block.title)}</p>
                <p className="mt-1 text-base leading-7 text-slate-600 sm:text-justify">{t(block.description)}</p>
              </div>
            ))}
          </div>
        ) : null}

        {section.note ? <p className="mt-1 text-sm italic text-slate-500">{t(section.note)}</p> : null}
      </div>
    </section>
  )
}

export default function StaticInfoPage({ title, description, paragraphs, sections, checkClassName = 'h-5 w-5 shrink-0 text-[#2563EB] sm:h-6 sm:w-6', footerNote, groups }: StaticInfoPageProps) {
  const { t } = useTranslation()
  const hasIntro = Boolean(description || paragraphs?.length)

  return (
    <section className="py-8 sm:py-12" aria-labelledby="static-page-title">
      <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white px-5 py-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:px-10 sm:py-12 lg:px-12">
        <h1 id="static-page-title" className="text-center text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
          {t(title)}
        </h1>

        {hasIntro ? (
          <div className="mt-6 space-y-4">
            {description ? <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">{t(description)}</p> : null}

            {paragraphs?.map((paragraph) => (
              <p key={paragraph} className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                {renderBoldText(t(paragraph))}
              </p>
            ))}
          </div>
        ) : null}

        {sections?.length ? (
          <div className={hasIntro ? 'mt-8 space-y-5 border-t border-slate-100 pt-8' : 'mt-6 space-y-5'}>
            {sections.map((section) => (
              <StaticInfoSectionBlock key={section.heading} section={section} checkClassName={checkClassName} />
            ))}
          </div>
        ) : null}

        {groups?.map((group) => (
          <section key={group.id} id={group.id} className="mt-8 scroll-mt-24 space-y-5 border-t border-slate-100 pt-8">
            <h2 className="text-xl font-bold text-[#1F2937] sm:text-2xl">{t(group.title)}</h2>
            {group.sections.map((section) => (
              <StaticInfoSectionBlock key={section.heading} section={section} checkClassName={checkClassName} headingLevel="h3" />
            ))}
            {group.note ? <p className="text-sm text-slate-500">{t(group.note)}</p> : null}
          </section>
        ))}

        {footerNote ? <p className="mt-6 text-center text-sm text-slate-500">{t(footerNote)}</p> : null}
      </div>
    </section>
  )
}
