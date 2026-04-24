import { useLocation } from 'react-router-dom'

function RoutePlaceholderPage({ title }) {
  const location = useLocation()

  return (
    <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      <p className="mt-2 text-slate-400">
        Route wired: {location.pathname}
      </p>
    </section>
  )
}

export default RoutePlaceholderPage

