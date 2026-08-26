import * as WebBrowser from 'expo-web-browser';

/**
 * Enlaces legales.
 *
 * TODO(legal): URLs pendientes. FlorySpec §113 pide enlaces reales en el registro, y
 * App Store rechaza una pantalla de alta cuyos términos no abren. Mientras `url` sea
 * null el enlace se ve, pero no navega: preferimos un enlace inerte a mandar al
 * usuario a un 404, que se lee como app abandonada.
 */
export const legalLinks = {
  terms: { label: 'Términos', url: null as string | null },
  privacy: { label: 'Privacidad', url: null as string | null },
};

export function hasLegalLinks(): boolean {
  return legalLinks.terms.url !== null && legalLinks.privacy.url !== null;
}

/**
 * Abre en el navegador del sistema, en modal, sin salir de la app.
 *
 * Importa que no salga: en iOS, mandar al usuario a Safari durante el registro tira
 * la pantalla al fondo y muchos no vuelven.
 */
export async function openLegal(which: 'terms' | 'privacy'): Promise<void> {
  const url = legalLinks[which].url;
  if (!url) return;
  await WebBrowser.openBrowserAsync(url).catch(() => {});
}
