function PageWrapper({ children, className = '' }) {
  return (
    <div className={`mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  )
}

export default PageWrapper