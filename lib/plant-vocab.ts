import { colors } from '@/theme/tokens';

/**
 * Vocabulario de entorno, en los términos que la persona puede observar.
 *
 * Vive aparte de las pantallas porque el onboarding, `plant/[id]/editar` y la ficha
 * tienen que nombrar el mismo dato igual. Si cada pantalla escribe su propia lista,
 * al editar aparece un vocabulario distinto del que se usó para preguntar.
 *
 * Los tipos son el espejo de los enums de Postgres (tables.sql:44-51). Viven aquí y
 * no en el draft del onboarding porque Home también los usa: una card del Home no
 * debería importar tipos desde `components/onboarding`.
 */

export type PlantStatus = 'bien' | 'atencion' | 'urgente';
export type LocationType = 'indoor' | 'outdoor';
export type WindowOrientation = 'norte' | 'sur' | 'este' | 'oeste' | 'sin_ventana';
export type LightDistance = 'junto_ventana' | 'cerca' | 'lejos';
export type SunExposure = 'sol_todo_dia' | 'sol_manana' | 'sol_tarde' | 'sombra_parcial' | 'sombra';
export type RainShelter = 'descubierta' | 'alero' | 'techada';
export type PotSize = 'chica' | 'media' | 'grande';
export type PotMaterial = 'plastico' | 'greda' | 'ceramica' | 'otro';

export type VocabOption<T> = {
  value: T;
  label: string;
  description?: string;
};

/**
 * Color de cada estado. Vive acá para que el héroe y el selector del Home no puedan
 * pintar la misma planta de dos colores distintos.
 *
 * Nunca rojo: el urgente es coral (Flory.md:86). El rojo dispara culpa, y la persona
 * que abre la app con una planta atrasada ya se siente mal.
 */
export const STATUS_TONE: Record<PlantStatus, { accent: string; soft: string }> = {
  bien: { accent: colors.statusBien, soft: colors.statusBienSoft },
  atencion: { accent: colors.statusAtencion, soft: colors.statusAtencionSoft },
  urgente: { accent: colors.statusUrgente, soft: colors.statusUrgenteSoft },
};

/**
 * Orientación de la ventana, preguntada por el horario del sol.
 *
 * Nadie sabe hacia dónde mira su ventana; todo el mundo sabe si el sol le llega en la
 * mañana o en la tarde. Se pregunta lo observable y se traduce aquí.
 *
 * **Hemisferio sur.** En Chile la ventana norte es la que más sol recibe y la sur la
 * que menos: al revés que en el hemisferio norte, que es de donde viene casi toda la
 * literatura de plantas de interior.
 *
 * `window_orientation` hoy no entra en `compute_interval` (tables.sql:302) — la rama
 * de interior solo usa `light_distance`. Se guarda como contexto, así que una
 * inferencia aproximada no descuadra ningún riego.
 */
export const SUN_TIME_OPTIONS: VocabOption<WindowOrientation | null>[] = [
  {
    value: 'este',
    label: 'Por la mañana',
    description: 'El sol entra temprano y después se va',
  },
  {
    value: 'oeste',
    label: 'Por la tarde',
    description: 'Le llega el sol caído de la tarde',
  },
  {
    value: 'norte',
    label: 'Casi todo el día',
    description: 'Es el rincón más luminoso de la casa',
  },
  {
    value: 'sur',
    label: 'Casi nunca le da directo',
    description: 'Hay claridad, pero no un rayo de sol',
  },
  {
    value: 'sin_ventana',
    label: 'No hay ventana cerca',
    description: 'Vive con luz de ampolleta',
  },
  {
    value: null,
    label: 'No estoy segura',
    description: 'Puedo contarte esto más adelante',
  },
];

/**
 * Camino inverso, para mostrar lo que la persona respondió.
 *
 * Se devuelve la etiqueta observable («Por la mañana»), nunca el punto cardinal: el
 * mapeo es una inferencia nuestra y presentarla como dato confirmado sería fingir
 * certeza sobre algo que nadie verificó.
 */
export function sunTimeLabel(orientation: WindowOrientation | null): string | null {
  if (orientation === null) return null;
  return SUN_TIME_OPTIONS.find((option) => option.value === orientation)?.label ?? null;
}

/**
 * Distancia a la ventana. Esta sí multiplica el intervalo (0.85 / 1.0 / 1.25), así
 * que las etiquetas son distancias concretas y no juicios relativos: «cerca» y
 * «lejos» significan cosas distintas en un departamento y en una casa.
 */
export const LIGHT_DISTANCE_OPTIONS: VocabOption<LightDistance | null>[] = [
  {
    value: 'junto_ventana',
    label: 'Junto a la ventana',
    description: 'A menos de un paso',
  },
  {
    value: 'cerca',
    label: 'Cerca',
    description: 'Misma pieza, un par de pasos',
  },
  {
    value: 'lejos',
    label: 'Lejos',
    description: 'Un rincón o pasillo sin ventana cerca',
  },
  {
    value: null,
    label: 'No estoy segura',
    description: 'Uso un punto medio mientras tanto',
  },
];

/** Ficha de especie, en la voz de la planta. */
export const LIGHT_NEED_LABEL: Record<'baja' | 'media' | 'alta', string> = {
  baja: 'Me basta con poca luz',
  media: 'Necesito luz media',
  alta: 'Necesito mucha luz',
};

export const OUTDOOR_LABEL: Record<'no' | 'semisombra_protegida' | 'si', string> = {
  si: 'Puedo vivir afuera',
  semisombra_protegida: 'Afuera solo en semisombra protegida',
  no: 'Estoy mejor adentro',
};

export const FROST_LABEL: Record<'si' | 'parcial' | 'no', string> = {
  si: 'Las heladas me hacen daño',
  parcial: 'Aguanto algo de frío',
  no: 'Resisto las heladas',
};

/**
 * Toxicidad para mascotas. Tres estados que **no se pueden colapsar en dos**.
 *
 * `no_listado_aspca` son 44 especies del catálogo que ASPCA no ha evaluado. Mostrarlas
 * como «no tóxica» es decirle a alguien que su gato puede masticarla sin riesgo cuando
 * nadie lo verificó. Es seguridad, no matiz de copy (FlorySpec §433).
 *
 * `sin_especie` no está en el enum: es la planta que todavía no se identificó. Sin
 * especie tampoco hay dato, así que cae en el mismo mensaje honesto.
 */
export const TOXICITY_COPY: Record<
  'si' | 'no' | 'no_listado_aspca' | 'sin_especie',
  { text: string; tone: 'warning' | 'safe' | 'unknown' }
> = {
  si: { text: 'Soy tóxica si tu mascota me mastica', tone: 'warning' },
  no: { text: 'No soy tóxica para mascotas', tone: 'safe' },
  no_listado_aspca: {
    text: 'No hay información confirmada sobre mi toxicidad',
    tone: 'unknown',
  },
  sin_especie: {
    text: 'Todavía no sé qué especie soy, así que no puedo confirmar si soy tóxica',
    tone: 'unknown',
  },
};

export const POT_SIZE_OPTIONS: VocabOption<PotSize>[] = [
  { value: 'chica', label: 'Chica', description: 'La levantas con una mano' },
  { value: 'media', label: 'Media', description: 'Necesitas las dos manos' },
  { value: 'grande', label: 'Grande', description: 'Cuesta moverla de lugar' },
];

/**
 * Material de la maceta. La greda baja el intervalo un 20 % porque transpira y la
 * tierra se seca antes; la cerámica esmaltada no. Mucha gente usa las dos palabras
 * como sinónimos, así que la diferencia va descrita por cómo se ve y se siente.
 */
export const POT_MATERIAL_OPTIONS: VocabOption<PotMaterial>[] = [
  { value: 'plastico', label: 'Plástico', description: 'Liviana, no transpira' },
  { value: 'greda', label: 'Greda', description: 'Barro sin esmaltar, opaco y poroso' },
  { value: 'ceramica', label: 'Cerámica', description: 'Esmaltada o pintada, lisa y brillante' },
  { value: 'otro', label: 'Otro', description: 'Metal, fibra o algo distinto' },
];
