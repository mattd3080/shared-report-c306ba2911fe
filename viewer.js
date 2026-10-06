// The decryption key is supplied only by the URL fragment, never the server.
export async function decryptReport(bytes, encodedKey) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(encodedKey)) throw new Error('Invalid key');
  const rawKey = Uint8Array.from(atob(encodedKey.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
  if (bytes.length < 33 || new TextDecoder().decode(bytes.slice(0, 5)) !== 'GRPT1') throw new Error('Invalid payload');
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(5, 17), tagLength: 128}, key, bytes.slice(17));
  const report = JSON.parse(new TextDecoder().decode(plaintext));
  if (report.version !== 1 || typeof report.html !== 'string' || typeof report.pdf !== 'string') throw new Error('Invalid report');
  return report;
}

async function openReport() {
  const match = location.hash.match(/^#k=([A-Za-z0-9_-]{43})$/);
  const status = document.getElementById('status');
  if (!match) return;
  status.textContent = 'Opening your report…';
  try {
    const response = await fetch(new URL('./report.bin', import.meta.url), {cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!response.ok) throw new Error('Unavailable');
    const report = await decryptReport(new Uint8Array(await response.arrayBuffer()), match[1]);
    const parsed = new DOMParser().parseFromString(report.html, 'text/html');
    const content = parsed.querySelector('main');
    if (!content) throw new Error('Missing report');
    const shadow = document.getElementById('report').attachShadow({mode: 'open'});
    for (const style of parsed.querySelectorAll('style')) {
      style.textContent = style.textContent.replace(/\bbody\s*\{/g, ':host{');
      shadow.append(document.importNode(style, true));
    }
    for (const element of content.querySelectorAll('script,iframe,object,embed,form,link')) element.remove();
    for (const element of content.querySelectorAll('*')) {
      for (const attribute of [...element.attributes]) {
        if (attribute.name.startsWith('on')) element.removeAttribute(attribute.name);
      }
    }
    shadow.append(document.importNode(content, true));
    shadow.addEventListener('click', event => {
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor) return;
      event.preventDefault();
      shadow.getElementById(anchor.getAttribute('href').slice(1))?.scrollIntoView({behavior: 'smooth', block: 'start'});
    });
    const pdf = Uint8Array.from(atob(report.pdf), c => c.charCodeAt(0));
    const pdfUrl = URL.createObjectURL(new Blob([pdf], {type: 'application/pdf'}));
    document.getElementById('download').href = pdfUrl;
    document.getElementById('gate').hidden = true;
    document.getElementById('unlocked').hidden = false;
    document.title = 'Strategic investor report';
    addEventListener('pagehide', () => URL.revokeObjectURL(pdfUrl), {once: true});
  } catch {
    status.textContent = 'This link could not open the report. Check that you have the complete shared link, then reload.';
  }
}

if (typeof document !== 'undefined') {
  openReport();
  addEventListener('hashchange', () => location.reload());
}
