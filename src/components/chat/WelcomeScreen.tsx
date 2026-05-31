import startupImageUrl from '@assets/Lamprey Startup FINAL.png'

export function WelcomeScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        <img
          src={startupImageUrl}
          alt=""
          aria-hidden
          className="icon-asset mb-6 h-40 w-40 object-contain"
        />
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Lamprey MAI
        </h1>
        <h2 className="mt-3 text-sm font-normal text-[var(--text-secondary)]">
          Let's get to work
        </h2>
      </div>
    </div>
  )
}
