/**
 * Conteo de días hasta el riego.
 *
 * La aritmética vive una sola vez porque es la parte que se rompe: el redondeo cambia
 * de sentido según el signo, y equivocarlo hace que una planta atrasada diga «hoy» o
 * que una que toca hoy diga «mañana».
 *
 * El texto **no** se comparte. Home habla en primera persona porque ahí la planta se
 * dirige a ti; la lista y la ficha usan tono neutro porque ahí se navega, no se
 * conversa. Misma cuenta, distinta voz.
 *
 * Solo días: nunca porcentajes, barras ni gráficos (Flory.md).
 */

/**
 * Días que faltan para el próximo riego. Negativo si ya pasó, `null` si no hay fecha.
 *
 * Hacia el futuro redondea hacia arriba y hacia el pasado hacia abajo, de modo que
 * cualquier fracción de día cuenta como día entero en la dirección correcta: quedan
 * «2 días» hasta el último minuto, y «hace 2 días» desde el primero.
 */
export function daysUntilWatering(nextWateringAt: string | null): number | null {
  if (!nextWateringAt) return null;

  const parsed = Date.parse(nextWateringAt);
  if (Number.isNaN(parsed)) return null;

  const days = (parsed - Date.now()) / 86_400_000;
  return days >= 0 ? Math.ceil(days) : Math.floor(days);
}

/** Etiqueta corta para listas y fichas. Tono neutro. */
export function wateringLabel(nextWateringAt: string | null): string {
  const days = daysUntilWatering(nextWateringAt);

  if (days === null) return 'Sin fecha aún';
  if (days < -1) return `Hace ${Math.abs(days)} días`;
  if (days === -1) return 'Desde ayer';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

/** Frase del Home, en primera persona. */
export function wateringSentence(nextWateringAt: string | null): string {
  const days = daysUntilWatering(nextWateringAt);

  if (days === null) return 'Aún estoy aprendiendo cuándo será mi próximo riego.';
  if (days < -1) return `Mi riego quedó pendiente hace ${Math.abs(days)} días.`;
  if (days === -1) return 'Mi riego quedó pendiente desde ayer.';
  if (days === 0) return 'Mi próximo riego es hoy.';
  if (days === 1) return 'Mi próximo riego es mañana.';
  return `Mi próximo riego es en ${days} días.`;
}

/** Cuánto pasó desde una fecha, para el historial. */
export function elapsedLabel(value: string | null): string {
  if (!value) return '—';

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '—';

  const days = Math.floor((Date.now() - parsed) / 86_400_000);

  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 30) return `Hace ${days} días`;

  const months = Math.floor(days / 30);
  if (months === 1) return 'Hace un mes';
  if (months < 12) return `Hace ${months} meses`;

  const years = Math.floor(months / 12);
  return years === 1 ? 'Hace un año' : `Hace ${years} años`;
}
