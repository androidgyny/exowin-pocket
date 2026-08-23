import { Show, splitProps, type JSX } from "solid-js";

/** Action-button variants, mapped to the existing stylesheet classes so the
 *  look is unchanged - this centralises behaviour, not design.
 *
 *  - `primary`   the one obvious action of a dialog or step
 *  - `secondary` its counterpart (Back, Cancel)
 *  - `small`     dense rows: content packs, settings
 *  - `danger`    destructive, always paired with a confirmation
 *  - `action`    the detail panel's action bar
 *  - `icon`      square icon-only button in the top bar
 */
export type ButtonVariant = "primary" | "secondary" | "small" | "danger" | "action" | "icon";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  small: "btn-small",
  danger: "btn-danger",
  action: "game-detail-btn",
  icon: "icon-btn",
};

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner and blocks input. An in-flight action must not be
   *  clickable twice - that used to be re-implemented per button, and one of
   *  them always forgot the `disabled`. */
  loading?: boolean;
  /** Replacement label while loading; defaults to the normal children. */
  loadingLabel?: JSX.Element;
}

/** Every action button in the app.
 *
 *  It exists for the states, not the styling: disabled and loading were spelled
 *  out at ~40 call sites, each free to forget one. A disabled button that still
 *  lit up on hover (because `.btn-small:hover` had no `:not(:disabled)`) read as
 *  clickable and was reported as such - the kind of thing a shared component
 *  fixes once. */
export function Button(props: ButtonProps) {
  const [own, rest] = splitProps(props, ["variant", "loading", "loadingLabel", "class", "children", "disabled"]);
  const variantClass = () => VARIANT_CLASS[own.variant ?? "small"];

  return (
    <button
      {...rest}
      // `app-btn` carries the layout every variant needs (centred content, an
      // icon that sits on the text's middle rather than its baseline). The
      // variant classes carry only colour and size.
      class={`app-btn ${variantClass()}${own.class ? ` ${own.class}` : ""}`}
      disabled={own.disabled || own.loading}
      aria-busy={own.loading || undefined}
    >
      <Show when={own.loading} fallback={own.children}>
        <span class="btn-spinner" />
        {own.loadingLabel ?? own.children}
      </Show>
    </button>
  );
}
