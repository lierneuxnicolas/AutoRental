import { Link } from 'react-router-dom'

export default function PublicFooter() {
  return (
    <footer className="border-t border-[#002B50]/30 bg-[#002B50] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <h3 className="text-base font-semibold text-white">À propos</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white">
              <Link to="/about" className="transition hover:underline">Qui sommes-nous ?</Link>
              <Link to="/terms" className="transition hover:underline">Conditions générales</Link>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">Confidentialité</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white">
              <Link to="/privacy" className="transition hover:underline">Politique de confidentialité et RGPD</Link>
              <Link to="/cookies" className="transition hover:underline">Gérer les cookies</Link>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">Réseaux sociaux</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white">
              <a href="https://www.instagram.com" target="_blank" rel="noreferrer" className="transition hover:underline">Instagram</a>
              <a href="https://www.facebook.com" target="_blank" rel="noreferrer" className="transition hover:underline">Facebook</a>
              <a href="https://www.linkedin.com" target="_blank" rel="noreferrer" className="transition hover:underline">LinkedIn</a>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">Avis clients</h3>
            <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-sm text-slate-200">Les avis GetaCar seront bientôt disponibles.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/15 bg-[#002B50] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-center text-sm text-white">
          <p>© 2026 GetACar</p>
        </div>
      </div>
    </footer>
  )
}
