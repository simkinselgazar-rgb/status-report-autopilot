export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 py-5 sm:px-10">
        <span className="font-serif text-[1rem] tracking-[-0.01em] text-ink">
          Status Report Autopilot
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-10 sm:py-16">
        {children}
      </main>
    </div>
  );
}
