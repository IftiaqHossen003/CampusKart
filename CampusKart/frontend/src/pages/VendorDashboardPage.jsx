function VendorDashboardPage() {
  return (
    <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-white">Vendor Dashboard</h1>
      <p className="mt-2 text-slate-400">Only users with the vendor role can access this route.</p>
    </section>
  )
}

export default VendorDashboardPage
