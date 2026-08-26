import { Bell, Cpu, House, Sprout, User } from 'lucide-react-native';
import type { ComponentType } from 'react';

export type TabIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

/**
 * Fuente única del tab bar. iOS y Android renderizan chrome distinto pero leen esta
 * misma lista, así que no se pueden desincronizar el orden, los iconos ni las etiquetas.
 *
 * Cinco ítems es el máximo que admite el BottomNav del design system (§8.3).
 * La cámara de diagnóstico NO vive aquí: se entra desde la ficha de la planta (con
 * `plant_id`) o desde la pestaña de Flory (sin planta — `diagnoses.plant_id` es nullable,
 * tables.sql:507).
 *
 * Las claves son los nombres de ruta dentro de `app/(tabs)/`, que es lo que
 * React Navigation expone en `state.routes[].name`.
 */
export const TAB_ORDER = ['index', 'plantas', 'actividad', 'flory', 'perfil'] as const;

export type TabName = (typeof TAB_ORDER)[number];

/** Etiquetas en sentence case, sin ALL CAPS. Cortas para que quepan a 11px. */
export const TABS: Record<TabName, { label: string; icon: TabIcon }> = {
  index: { label: 'Hoy', icon: House },
  plantas: { label: 'Plantas', icon: Sprout },
  actividad: { label: 'Avisos', icon: Bell },
  flory: { label: 'Flory', icon: Cpu },
  perfil: { label: 'Perfil', icon: User },
};

export function isTabName(name: string): name is TabName {
  return name in TABS;
}
