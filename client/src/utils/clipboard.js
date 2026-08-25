/**
 * Cross-platform clipboard helper supporting both secure HTTPS and HTTP LAN environments
 */
export async function copyToClipboard(text) {
  if (typeof window === 'undefined') return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {}
  }

  // Fallback for non-secure HTTP LAN contexts (e.g. phone accessing http://192.168.1.78:3001)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    textArea.remove();
    return successful;
  } catch (err) {
    return false;
  }
}
