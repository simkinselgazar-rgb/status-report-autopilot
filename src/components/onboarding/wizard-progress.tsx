export function WizardProgress({ current }: { current: number }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ease-out ${
              n < current ? 'bg-pine' : n === current ? 'bg-ink' : 'bg-line'
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-[0.8rem] font-medium tracking-[0.01em] text-ink-faint">
        Step {current} of 4
      </p>
    </div>
  );
}
