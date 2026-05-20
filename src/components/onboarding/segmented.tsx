interface Option<T extends string> {
  id: T;
  label: string;
  note: string;
}

interface Props<T extends string> {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div>
      <p className="text-[0.82rem] font-medium text-ink-soft">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-sunk p-1.5">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`flex flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition-[background-color,color,box-shadow] duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                active
                  ? 'bg-surface text-ink shadow-[var(--shadow-raised)]'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              <span className="text-[0.9rem] font-medium">{option.label}</span>
              <span className="text-[0.76rem] text-ink-faint">{option.note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
