import { Fragment, useEffect, useRef } from "react";
import {
  formatKey,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutAction,
} from "./shortcuts";

export function Keys({ action }: { action: ShortcutAction }) {
  return SHORTCUTS[action].keys.map((key, index) => (
    <Fragment key={key}>
      {index > 0 && " or "}
      <kbd>{formatKey(key)}</kbd>
    </Fragment>
  ));
}

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // React runs effects twice in development, and showModal() throws if the
    // dialog is already open.
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  const actions = Object.keys(SHORTCUTS) as ShortcutAction[];

  return (
    <dialog
      ref={ref}
      className="shortcut-help"
      aria-labelledby="shortcut-help-title"
      onClose={onClose}
    >
      <h2 id="shortcut-help-title">Keyboard shortcuts</h2>
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group}>
          <h3>{group}</h3>
          <table>
            <tbody>
              {actions
                .filter((action) => SHORTCUTS[action].group === group)
                .map((action) => (
                  <tr key={action}>
                    <td>
                      <Keys action={action} />
                    </td>
                    <td>{SHORTCUTS[action].description}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
      <form method="dialog">
        <button type="submit" autoFocus>
          Close
        </button>
      </form>
    </dialog>
  );
}
