import { Advantages, CallToAction, FaqSection, Hero, HowItWorks, PopularVehicles, SearchSection } from '../../components/home'

export default function HomePage() {
  return (
    <>
      <Hero />
      <SearchSection />
      <HowItWorks />
      <Advantages />
      <PopularVehicles />
      <FaqSection />
      <CallToAction />
    </>
  )
}