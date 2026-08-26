import { Screen } from '@/components/screen';

/**
 * Pantalla transaccional: tono neutro y corporativo, no la voz de la planta
 * (Flory.md §4, «la única excepción»).
 *
 * Riesgo App Store: tiene que quedar claro que es un bien físico con envío y fecha de
 * entrega visible. Si un reviewer lo lee como contenido digital, exige IAP.
 */
export default function ReservaDetalleScreen() {
  return (
    <Screen
      title="Reserva tu Flory One"
      description="Dirección de envío, fecha de entrega visible y Payment Sheet con capture_method manual."
    />
  );
}
