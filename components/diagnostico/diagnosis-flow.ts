/**
 * Traspaso en memoria de la foto entre la cámara y la pantalla de análisis.
 *
 * No va por params de ruta: una URI local es larga y fea en un deep link, y la foto no
 * debe sobrevivir a un reinicio de la app (a diferencia del draft de onboarding, que sí
 * se persiste). Es un único objeto vivo mientras el flujo está abierto; la pantalla de
 * análisis lo consume una vez y lo limpia.
 */

import type { DiagnosisFocus } from '@/lib/ai';

export type PendingCapture = {
  plantId: string;
  localUri: string;
  focus: DiagnosisFocus;
  width?: number;
  height?: number;
};

let pending: PendingCapture | null = null;

export function setPendingCapture(capture: PendingCapture): void {
  pending = capture;
}

/** Devuelve la captura pendiente y la borra: se usa una sola vez. */
export function consumePendingCapture(): PendingCapture | null {
  const current = pending;
  pending = null;
  return current;
}
