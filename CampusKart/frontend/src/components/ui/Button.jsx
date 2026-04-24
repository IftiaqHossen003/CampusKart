function Button({ children, className = '', ...props }) {
  return (
    <button
      className={`rounded-xl bg-[var(--ck-accent)] px-4 py-2 font-semibold text-[#111111] transition hover:bg-[var(--ck-accent-hover)] ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button

