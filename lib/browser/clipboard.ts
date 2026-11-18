/**
 * Copy text to the user's clipboard using navigator.clipboard with an offscreen textarea fallback.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback when Clipboard API permission is restricted
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const activeDialog =
    document.activeElement instanceof Element ? document.activeElement.closest('dialog') : null;
  const mountNode = activeDialog ?? document.body;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  mountNode.appendChild(textarea);
  textarea.select();

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    mountNode.removeChild(textarea);
  }
  return ok;
}
