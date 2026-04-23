import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from "react";
import { cx } from "../../utils/cx";

type InlineEditableTextProps = {
  className?: string;
  displayClassName?: string;
  draftValue: string;
  editing: boolean;
  inputClassName?: string;
  inputFieldClassName?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onCancel: () => void;
  onChange: (nextValue: string) => void;
  onCommit: () => void;
  onStartEdit: () => void;
  title?: string;
  value: string;
};

const InlineEditableText = ({
  className,
  displayClassName = "",
  draftValue,
  editing,
  inputClassName = "",
  inputFieldClassName = "",
  inputRef,
  onCancel,
  onChange,
  onCommit,
  onStartEdit,
  title,
  value,
}: InlineEditableTextProps) => {
  const pendingExitActionRef = useRef<"commit" | "cancel" | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    const node = inputRef?.current ?? localInputRef.current;
    node?.focus();
    node?.select();
  }, [editing, inputRef]);

  const handleBlur = (_event: FocusEvent<HTMLInputElement>) => {
    const pendingAction = pendingExitActionRef.current;
    pendingExitActionRef.current = null;
    if (pendingAction === "cancel") {
      onCancel();
      return;
    }
    onCommit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      pendingExitActionRef.current = "commit";
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      pendingExitActionRef.current = "cancel";
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className={cx(
        "flex h-6 min-w-0 flex-1 items-center rounded-md px-1.5 transition-colors",
        editing ? "bg-bg-page" : "bg-transparent",
        className,
        inputFieldClassName,
      )}
      title={title}
    >
      <input
        ref={(node) => {
          localInputRef.current = node;
          if (!inputRef) return;
          inputRef.current = node;
        }}
        type="text"
        value={editing ? draftValue : value}
        readOnly={!editing}
        onChange={(event) => {
          if (!editing) return;
          onChange(event.target.value);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => {
          if (!editing) onStartEdit();
        }}
        autoComplete="off"
        className={cx(
          "h-full min-w-0 flex-1 bg-transparent border-0 p-0 outline-none focus:outline-none focus:ring-0 text-[11px] leading-4",
          editing
            ? "cursor-text text-text-primary"
            : "cursor-text text-text-secondary select-text",
          displayClassName,
          inputClassName,
        )}
      />
    </div>
  );
};

export default InlineEditableText;
