const AppCard = ({ title, subtitle, children, className = '' }) => {
  return (
    <div className={`card bg-base-100 border border-base-300 shadow-sm ${className}`}>
      <div className="card-body">
        {(title || subtitle) && (
          <div className="mb-2">
            {title && <h2 className="card-title text-base-content">{title}</h2>}
            {subtitle && <p className="text-sm text-base-content/70">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export default AppCard;

