import { Screen } from '@/components/screen';

/**
 * `profiles.push_enabled` y `profiles.push_hour`. Los switches guardan al instante:
 * no llevan botón «Guardar» (design system §8.2).
 */
export default function AjustesNotificacionesScreen() {
  return (
    <Screen
      title="Avisos"
      description="A qué hora te escribimos y por qué. Te escribimos solo cuando hace falta."
    />
  );
}
