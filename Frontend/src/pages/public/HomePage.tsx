import { Advantages, Hero, HowItWorks, PopularVehicles, SearchSection } from '../../components/home'

export default function HomePage() {
  return (
    <>
      <Hero />
      <SearchSection />
      <HowItWorks />
      <Advantages />
      <PopularVehicles />
    </>
  )
}