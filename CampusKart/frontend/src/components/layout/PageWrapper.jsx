function PageWrapper({ children, className = "" }) {
  return (
    <div className={`w-full ${className}`}>
      {children}
    </div>
  );
}

export default PageWrapper;
