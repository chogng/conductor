export type EmptyViewOptions = {
  readonly hint: string;
  readonly title: string;
};

const createMessage = ({
  hint,
  title,
}: Pick<EmptyViewOptions, "hint" | "title">): HTMLDivElement => {
  const message = document.createElement("div");
  message.className = "chart_view_empty";

  const titleElement = document.createElement("p");
  titleElement.className = "chart_view_empty_title";
  titleElement.textContent = title;
  message.append(titleElement);

  if (hint) {
    const hintElement = document.createElement("p");
    hintElement.className = "chart_view_empty_hint";
    hintElement.textContent = hint;
    message.append(hintElement);
  }

  return message;
};

export const createEmptyView = (options: EmptyViewOptions): HTMLDivElement => {
  return createMessage(options);
};
