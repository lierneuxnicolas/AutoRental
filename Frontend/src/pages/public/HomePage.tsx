import { CallToAction, Hero, PopularVehicles, SearchSection } from '../../components/home'

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <Hero />
      <SearchSection />
      <PopularVehicles />
      <CallToAction />
    </div>
  )
}