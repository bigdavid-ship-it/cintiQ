export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center px-4 py-16" aria-busy="true">
      <div className="flex flex-col items-center gap-3">
        <svg width="44" height="44" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
          <rect width="32" height="32" rx="8" fill="#0e5c63" />
          <path
            d="M16 7.5C11.3056 7.5 7.5 11.3056 7.5 16C7.5 20.6944 11.3056 24.5 16 24.5C18.08 24.5 19.985 23.752 21.46 22.51"
            stroke="#ffffff"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path d="M18.5 18.5L24.5 24.5" stroke="#e8a33d" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="22.5" cy="11.5" r="2.2" fill="#e8a33d" />
        </svg>
        <p className="font-display text-sm font-medium text-muted-foreground">Loading cintiQ...</p>
      </div>
    </div>
  );
}
