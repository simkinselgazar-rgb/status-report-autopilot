import { Button } from '@/components/ui/button';

interface Props {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  hint?: string;
}

export function WizardFooter({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled = false,
  hint,
}: Props) {
  return (
    <div className="mt-10">
      {hint ? (
        <p className="mb-3 text-[0.85rem] text-ink-faint anim-fade">{hint}</p>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
        ) : (
          <span aria-hidden="true" />
        )}
        <Button onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
