interface StaticInfoPageProps {
  title: string
  description: string
}

export default function StaticInfoPage({ title, description }: StaticInfoPageProps) {
  return (
    <section className="py-8 sm:py-10" aria-labelledby="static-page-title">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-slate-200 bg-white px-6 py-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:px-8 lg:px-10">
        <h1 id="static-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">{description}</p>
      </div>
    </section>
  )
}
