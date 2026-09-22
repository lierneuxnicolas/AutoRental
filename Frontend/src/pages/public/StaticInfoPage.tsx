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
}

function renderBoldText(text: string) {
  const parts = text.split('**')
  return parts.map((part, index) =>
    index % 2 === 1 ? <strong key={index} className="font-semibold text-[#1F2937]">{part}</strong> : <Fragment key={index}>{part}</Fragment>,
  )
}

function StaticInfoSectionBlock({ section }: { section: StaticInfoSection }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50/60 px-5 py-5 sm:px-6 sm:py-6">
      {section.headingStyle === 'emphasis' ? (
        <h2 className="text-center text-lg font-bold tracking-tight text-[#1F2937] sm:text-xl">
          — {section.heading} —
        </h2>
      ) : section.headingStyle === 'plain' ? (
        <h2 className="text-lg font-bold tracking-tight text-[#1F2937] sm:text-xl">{section.heading}</h2>
      ) : (
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-[#1F2937] sm:text-xl">
          <Check className="h-5 w-5 shrink-0 text-[#2563EB] sm:h-6 sm:w-6" aria-hidden="true" />
          {section.heading}
        </h2>
      )}

      <div className="mt-4 space-y-3">
        {section.content}

        {section.addressLines ? (
          <div className="space-y-1 text-base leading-7 text-slate-600 sm:text-lg">
            {section.addressLines.map((line) => (
              <p key={line}>{renderBoldText(line)}</p>
            ))}
          </div>
        ) : null}

        {section.paragraphs?.map((paragraph) => (
          <p key={paragraph} className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
            {renderBoldText(paragraph)}
          </p>
        ))}

        {section.valueBlocks ? (
          <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-12">
            {section.valueBlocks.map((block) => (
              <div key={block.title}>
                <p className="font-bold text-[#1F2937]">{block.title}</p>
                <p className="mt-1 text-base leading-7 text-slate-600 sm:text-justify">{block.description}</p>
              </div>
            ))}
          </div>
        ) : null}

        {section.note ? <p className="mt-1 text-sm italic text-slate-500">{section.note}</p> : null}
      </div>
    </section>
  )
}

export default function StaticInfoPage({ title, description, paragraphs, sections }: StaticInfoPageProps) {
  const hasIntro = Boolean(description || paragraphs?.length)

  return (
    <section className="py-8 sm:py-12" aria-labelledby="static-page-title">
      <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white px-5 py-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:px-10 sm:py-12 lg:px-12">
        <h1 id="static-page-title" className="text-center text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
          {title}
        </h1>

        {hasIntro ? (
          <div className="mt-6 space-y-4">
            {description ? <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">{description}</p> : null}

            {paragraphs?.map((paragraph) => (
              <p key={paragraph} className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                {renderBoldText(paragraph)}
              </p>
            ))}
          </div>
        ) : null}

        {sections?.length ? (
          <div className={hasIntro ? 'mt-8 space-y-5 border-t border-slate-100 pt-8' : 'mt-6 space-y-5'}>
            {sections.map((section) => (
              <StaticInfoSectionBlock key={section.heading} section={section} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
