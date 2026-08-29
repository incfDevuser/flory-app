import * as WebBrowser from 'expo-web-browser';

export const legalLinks = {
  terms: { label: 'Términos', url: 'https://somosflory.cl/terminos' },
  privacy: { label: 'Privacidad', url: 'https://somosflory.cl/privacidad' },
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
