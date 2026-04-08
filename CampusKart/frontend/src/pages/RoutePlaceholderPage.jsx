import { useLocation } from 'react-router-dom'

function RoutePlaceholderPage({ title }) {
  const location = useLocation()

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-primary">{title}</h1>
      <p className="mt-2 text-muted">
        Route wired: {location.pathname}
      </p>
    </section>
  )
}

export default RoutePlaceholderPage
