import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ConfirmOptions = { title: string; message?: string; confirmText?: string; cancelText?: string; danger?: boolean };
type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmContextValue>(async () => false);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const ask = useCallback((next: ConfirmOptions) => new Promise<boolean>(resolve => {
    resolver.current?.(false);
    resolver.current = resolve;
    setOptions(next);
  }), []);

  useEffect(() => {
    if (!options) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options, close]);

  useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {options && (
        <div className="confirm-backdrop" onClick={() => close(false)}>
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={options.message ? 'confirm-message' : undefined} onClick={event => event.stopPropagation()}>
            <span className={'confirm-mark' + (options.danger ? ' is-danger' : '')} aria-hidden="true">{options.danger ? '!' : '?'}</span>
            <h2 id="confirm-title">{options.title}</h2>
            {options.message ? <p id="confirm-message">{options.message}</p> : null}
            <div className="confirm-actions">
              <button type="button" className="btn secondary" onClick={() => close(false)}>{options.cancelText ?? 'Cancel'}</button>
              <button type="button" className={'btn ' + (options.danger ? 'danger' : 'primary')} onClick={() => close(true)} autoFocus>{options.confirmText ?? 'Confirm'}</button>
            </div>
          </section>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
