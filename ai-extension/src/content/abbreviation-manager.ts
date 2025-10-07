const ABBREVIATION_PATTERN = /\/(\w+)$/;

export function handleTabCompletion(
  textField: HTMLInputElement | HTMLTextAreaElement,
): void {
  textField.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== "Tab") return;

    const { value, selectionStart } = textField;
    if (selectionStart == null) return;

    const beforeCursor = value.slice(0, selectionStart);
    const match = beforeCursor.match(ABBREVIATION_PATTERN);
    if (!match) return;

    keyboardEvent.preventDefault();
    console.debug("Abbreviation detected", match[1]);
  });
}

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (
    !(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    )
  ) {
    return;
  }
  handleTabCompletion(target);
});
