// The four screen states, each designed separately:
//   loading -> Skeleton     empty -> EmptyState     error -> ErrorState
// (success is shown with toasts and inline messages.)
// A failed request must never look like something that is "still loading".

export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, ...style }} />;
}

export function SkeletonRows({ count = 5 }) {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={18} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load this' }) {
  const offline = error && error.code === 'NETWORK_ERROR';
  return (
    <div className="state state-error" role="alert">
      <div className="state-icon">!</div>
      <h3>{offline ? 'Server not reachable' : title}</h3>
      <p>
        {offline
          ? 'The app could not contact the server. Check that the backend is running, then try again.'
          : (error && error.message) || 'An unexpected error occurred.'}
      </p>
      {onRetry && (
        <button type="button" className="btn btn-outline btn-small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="state">
      <div className="state-icon state-icon-soft">∅</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}