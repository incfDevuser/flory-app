import { useNetworkState } from 'expo-network';

/**
 * `true` solo cuando sabemos con certeza que no hay red.
 *
 * El estado arranca en `undefined` mientras el módulo consulta al sistema. Tratar ese
 * hueco como «sin conexión» haría parpadear el banner en cada arranque, así que solo
 * se considera offline cuando la respuesta ya llegó y es negativa.
 *
 * `isInternetReachable` es más honesto que `isConnected`: un wifi de cafetería con
 * portal cautivo está conectado y no llega a ninguna parte.
 */
export function useOffline(): boolean {
  const state = useNetworkState();

  if (state.isInternetReachable === false) return true;
  if (state.isConnected === false) return true;
  return false;
}
