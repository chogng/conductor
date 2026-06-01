export type EmptyViewOptions = {
  readonly description?: string;
  readonly title: string;
};

export const createEmptyView = ({
  description,
  title,
}: EmptyViewOptions): HTMLDivElement => {
  const root = document.createElement("div");
  root.className = "table_view_empty";

  const titleElement = document.createElement("p");
  titleElement.className = "table_view_empty_title";
  titleElement.textContent = title;
  root.append(titleElement);

  if (description) {
    const descriptionElement = document.createElement("p");
    descriptionElement.className = "table_view_empty_description";
    descriptionElement.textContent = description;
    root.append(descriptionElement);
  }

  return root;
};
