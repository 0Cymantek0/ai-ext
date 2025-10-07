export function initializeTextEnhancer(): void {
  console.info("AI Pocket text enhancer ready");
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

  console.debug("Text enhancer would inject button", { name: target.name });
});
