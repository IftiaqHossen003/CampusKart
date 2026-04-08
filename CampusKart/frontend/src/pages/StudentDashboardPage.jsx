function StudentDashboardPage() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-primary">Student Dashboard</h1>
      <p className="mt-2 text-muted">Only users with the student role can access this route.</p>
    </section>
  )
}

export default StudentDashboardPage