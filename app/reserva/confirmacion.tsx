import { Screen } from '@/components/screen';

/** Sin gesto de cierre ni botón de volver: no se regresa a la pantalla de pago. */
export default function ReservaConfirmacionScreen() {
  return (
    <Screen
      title="Reserva confirmada"
      description="El webhook de Stripe escribe en `reservations`. Aquí va el número de pedido y la fecha estimada."
    />
  );
}
