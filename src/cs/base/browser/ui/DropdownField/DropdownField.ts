import "src/cs/base/browser/ui/dropdownField/dropdownField.css";

export type DropdownFieldValue = string | number;

export type DropdownFieldOption =
  | DropdownFieldItemOption
  | DropdownFieldSeparatorOption
  | DropdownFieldGroupOption;

export type DropdownFieldItemOption = {
  readonly value: DropdownFieldValue;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
};

export type DropdownFieldSeparatorOption = {
  readonly type: "separator";
};

export type DropdownFieldGroupOption = {
  readonly type: "group";
  readonly label: string;
  readonly options: readonly DropdownFieldOption[];
};

export const isSelectableDropdownFieldOption = (
  option: DropdownFieldOption,
): option is DropdownFieldItemOption =>
  !("type" in option) && option.value !== undefined;
