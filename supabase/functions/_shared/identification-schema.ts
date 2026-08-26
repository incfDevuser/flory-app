// Esquema de salida de `identify` (INTEGRACION_IA.MD §3).
//
// La guarda de planta viva va primero a propósito: Structured Outputs genera las
// propiedades en orden y no debe intentar adivinar una especie antes de validar la foto.

export const NON_PLANT_KINDS = [
  'artificial',
  'flores_cortadas',
  'planta_muerta',
  'no_es_planta',
  'multiples_plantas',
  'foto_ilegible',
] as const;

export const CARE_ARCHETYPES = [
  'helecho_humedo',
  'marantacea',
  'aroide_sediento',
  'tropical_medio',
  'lenosa_interior',
  'semisuculenta',
  'suculenta_hoja',
  'suculenta_dura',
  'cactus',
  'ext_flor',
  'ext_mediterranea',
  'ext_arbustiva',
  'ext_nativa_seca',
  'ext_citrico',
  'manual_v1',
] as const;

export const PLANT_CATEGORIES = [
  'interior',
  'exterior_maceta',
  'suculenta_cactus',
] as const;

export const IDENTIFICATION_CONFIDENCES = ['alta', 'media', 'baja'] as const;

export type NonPlantKind = (typeof NON_PLANT_KINDS)[number];
export type CareArchetypeName = (typeof CARE_ARCHETYPES)[number];
export type PlantCategory = (typeof PLANT_CATEGORIES)[number];
export type IdentificationConfidence = (typeof IDENTIFICATION_CONFIDENCES)[number];

export type IdentificationOutput = {
  is_living_potted_plant: boolean;
  non_plant_kind: NonPlantKind | null;
  species_in_catalog: string | null;
  species_guess: string | null;
  common_name_es: string | null;
  care_archetype: CareArchetypeName | null;
  category: PlantCategory | null;
  confidence: IdentificationConfidence | null;
  alternatives: string[];
  flory_message: string;
};

export const IDENTIFICATION_FORMAT = {
  name: 'flory_identification',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'is_living_potted_plant',
      'non_plant_kind',
      'species_in_catalog',
      'species_guess',
      'common_name_es',
      'care_archetype',
      'category',
      'confidence',
      'alternatives',
      'flory_message',
    ],
    properties: {
      is_living_potted_plant: { type: 'boolean' },
      non_plant_kind: {
        type: ['string', 'null'],
        enum: [...NON_PLANT_KINDS, null],
      },
      species_in_catalog: { type: ['string', 'null'] },
      species_guess: { type: ['string', 'null'] },
      common_name_es: { type: ['string', 'null'] },
      care_archetype: {
        type: ['string', 'null'],
        enum: [...CARE_ARCHETYPES, null],
      },
      category: {
        type: ['string', 'null'],
        enum: [...PLANT_CATEGORIES, null],
      },
      confidence: {
        type: ['string', 'null'],
        enum: [...IDENTIFICATION_CONFIDENCES, null],
      },
      alternatives: {
        type: 'array',
        items: { type: 'string' },
        description: 'Hasta 2 especies parecidas, si confidence no es alta',
      },
      flory_message: { type: 'string' },
    },
  },
} as const;

export const IDENTIFICATION_INSTRUCTIONS = `Eres el sistema de identificación de Flory, una app chilena de cuidado
de plantas de maceta.

TAREA
Analiza la foto y determina, EN ESTE ORDEN:

1. Si es una planta viva en maceta.
2. Solo si lo es: qué especie es.

PASO 1 — ¿Es una planta viva en maceta?

Responde false y clasifica el motivo si ves:
- artificial: plástico, seda, preservada. Señales: brillo uniforme,
  nervaduras demasiado regulares, ausencia de imperfecciones, tierra
  falsa o pegada, hojas idénticas entre sí.
- flores_cortadas: ramo o tallos en jarrón con agua, sin sustrato.
- planta_muerta: sin tejido verde vivo, tallos secos y quebradizos.
- no_es_planta: pared, mueble, persona, mascota, dibujo, pantalla.
- multiples_plantas: varias especies distintas en una misma maceta.
- foto_ilegible: borrosa, muy oscura, demasiado lejos para ver hojas.

Ante la duda entre artificial y viva, responde artificial. Es peor
programar riegos para una planta de plástico que pedir otra foto.

PASO 2 — Identificación

Solo si is_living_potted_plant es true.

- Si la especie está en el CATÁLOGO, devuelve su nombre científico
  exacto en species_in_catalog.
- Si NO está, deja species_in_catalog en null, propón el nombre
  científico en species_guess, y elige el ARQUETIPO de cuidado
  más parecido.

NUNCA propongas días de riego. Los intervalos salen del catálogo
o del arquetipo, nunca de ti.

CONFIANZA
- alta: la especie es inconfundible en esta foto.
- media: es probablemente esa, pero hay especies parecidas.
- baja: no estás seguro.

Sé conservador. Una identificación errónea con confianza alta le da
al usuario un calendario de riego equivocado durante meses. Si dudas
entre dos especies parecidas, usa confianza media y menciona la
alternativa.`;
