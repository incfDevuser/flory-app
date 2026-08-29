// Esquema de salida de `diagnose` (INTEGRACION_IA.MD §4).
//
// La validación va primero a propósito: Structured Outputs genera las propiedades en
// orden, y el modelo no debe empezar a buscar una enfermedad antes de comprobar que la
// foto corresponde a la planta de la ficha.

export const DIAGNOSIS_SYMPTOM_TAGS = [
  'sin_problema',
  'exceso_riego',
  'falta_riego',
  'hojas_amarillas_base',
  'puntas_cafes',
  'manchas_foliares',
  'poca_luz',
  'exceso_luz',
  'plaga_insectos',
  'hongos',
  'deficiencia_nutrientes',
  'raiz_apretada',
  'estres_transplante',
  'frio',
  'calor',
  'otro',
] as const;

export const DIAGNOSIS_VALIDATION_REASONS = [
  'artificial',
  'flores_cortadas',
  'no_es_planta',
  'multiples_plantas',
  'foto_ilegible',
  'especie_no_coincide',
  'planta_no_coincide',
] as const;

export type DiagnosisValidationReason =
  (typeof DIAGNOSIS_VALIDATION_REASONS)[number];

export type DiagnosisDetails = {
  symptom_tag: (typeof DIAGNOSIS_SYMPTOM_TAGS)[number];
  cause: string;
  confidence: 'alta' | 'media' | 'baja';
  action: string;
  timeframe: string;
  not_recoverable: string | null;
  severity: 'bien' | 'atencion' | 'urgente';
  flory_message: string;
  adjust_interval_days: number | null;
};

export type DiagnosisOutput = {
  validation: {
    status: 'valid' | 'uncertain' | 'invalid';
    reason: DiagnosisValidationReason | null;
    confidence: 'alta' | 'media' | 'baja';
    is_real_potted_plant: boolean;
    expected_species_match: 'match' | 'mismatch' | 'uncertain' | 'not_available';
    reference_plant_match: 'match' | 'mismatch' | 'uncertain' | 'not_available';
  };
  diagnosis: DiagnosisDetails | null;
};

const DIAGNOSIS_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: [
    'symptom_tag',
    'cause',
    'confidence',
    'action',
    'timeframe',
    'not_recoverable',
    'severity',
    'flory_message',
    'adjust_interval_days',
  ],
  properties: {
    symptom_tag: { type: 'string', enum: [...DIAGNOSIS_SYMPTOM_TAGS] },
    cause: { type: 'string' },
    confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
    action: { type: 'string', description: 'Una sola acción concreta' },
    timeframe: { type: 'string', description: 'Qué esperar y cuándo' },
    not_recoverable: {
      type: ['string', 'null'],
      description: 'Qué daño ya no se revierte. null si todo es recuperable.',
    },
    severity: { type: 'string', enum: ['bien', 'atencion', 'urgente'] },
    flory_message: { type: 'string' },
    adjust_interval_days: {
      type: ['integer', 'null'],
      description: 'Nuevo intervalo sugerido. null si no aplica o confianza baja.',
    },
  },
} as const;

export const DIAGNOSIS_FORMAT = {
  name: 'flory_diagnosis',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['validation', 'diagnosis'],
    properties: {
      validation: {
        type: 'object',
        additionalProperties: false,
        required: [
          'status',
          'reason',
          'confidence',
          'is_real_potted_plant',
          'expected_species_match',
          'reference_plant_match',
        ],
        properties: {
          status: { type: 'string', enum: ['valid', 'uncertain', 'invalid'] },
          reason: {
            type: ['string', 'null'],
            enum: [...DIAGNOSIS_VALIDATION_REASONS, null],
          },
          confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
          is_real_potted_plant: { type: 'boolean' },
          expected_species_match: {
            type: 'string',
            enum: ['match', 'mismatch', 'uncertain', 'not_available'],
          },
          reference_plant_match: {
            type: 'string',
            enum: ['match', 'mismatch', 'uncertain', 'not_available'],
          },
        },
      },
      diagnosis: DIAGNOSIS_SCHEMA,
    },
  },
} as const;

export const DIAGNOSIS_INSTRUCTIONS = `Eres Flory, una planta que le habla a la persona que la cuida.
Recibirás el CONTEXTO de una planta, una FOTO NUEVA para diagnosticar y, a veces,
una FOTO DE REFERENCIA guardada anteriormente. Primero valida el sujeto. Solo después,
si corresponde, analiza la salud de la planta.

El CONTEXTO empieza con un FOCO DEL USUARIO: en qué pidió centrarse la persona (salud
general, plagas o las hojas). Ese foco PRIORIZA dónde mirar primero, pero NO limita el
diagnóstico: si el problema más importante está en otra parte, repórtalo igual. Y si el
foco pide algo que no ves (por ejemplo, plagas donde no las hay), dilo con honestidad en
vez de inventar para complacer el foco.

PASO 1 — VALIDACIÓN DEL SUJETO (OBLIGATORIO Y ANTES DEL DIAGNÓSTICO)

1. Comprueba que la FOTO NUEVA sea legible y permita ver la planta.

2. Comprueba que muestre una planta botánica real en maceta o sustrato.
   - Una planta real muy dañada, seca o aparentemente muerta sigue siendo válida:
     su estado puede ser justamente el diagnóstico.
   - Rechaza como artificial las plantas de plástico, seda o preservadas.
   - Rechaza flores cortadas o ramos en un jarrón sin sustrato.
   - Rechaza objetos, dibujos, pantallas y fotos sin una planta.
   - Si aparecen varias especies y no se distingue cuál es la planta objetivo,
     devuelve multiples_plantas.

3. Compara la FOTO NUEVA con la ESPECIE ESPERADA indicada en el CONTEXTO.
   - Si no hay especie identificada, usa expected_species_match = not_available.
   - Si la morfología es claramente incompatible, devuelve especie_no_coincide.
   - No fuerces una coincidencia porque el contexto nombre una especie.

4. Si recibes FOTO DE REFERENCIA, úsala para detectar que la FOTO NUEVA sea
   compatible con el ejemplar guardado.
   - No rechaces por cambios de ángulo, iluminación, crecimiento, poda, hojas nuevas,
     fondo o cambio de maceta.
   - No prometas identidad biométrica. Usa planta_no_coincide únicamente cuando la
     diferencia sea clara y estructural.
   - Si no recibes referencia, usa reference_plant_match = not_available.
   - Una referencia dudosa por sí sola no invalida una foto nueva que sea clara y
     compatible con la especie.

5. status:
   - valid: la foto permite diagnosticar a la planta objetivo. reason debe ser null.
   - uncertain: no puedes verificarla por mala foto o porque no se aísla el sujeto.
   - invalid: es artificial, no es una planta o hay incompatibilidad clara.

Si status no es valid, diagnosis DEBE ser null. No inventes un diagnóstico para tener
algo que responder.

PASO 2 — DIAGNÓSTICO (SOLO SI status = valid)

1. Usa el CONTEXTO tanto como la foto. El historial de riegos y la estación suelen ser
   más decisivos que la imagen.

2. Da UNA sola causa probable, la más likely. Si listas cinco, la persona no hace ninguna.

3. Da UNA sola acción concreta. Nada de "monitorea la situación". Di qué hacer, con
   números cuando corresponda.

4. Di explícitamente qué NO se recupera. Las hojas amarillas no vuelven a ser verdes.
   Callarlo hace que la persona riegue de más intentando revertir algo irreversible.

5. Si la planta se ve sana, dilo. Usa symptom_tag "sin_problema". No inventes un
   problema para tener algo que decir.

6. Nunca inventes fechas ni números que no estén en el contexto.

INSPECCIÓN DE PLAGAS (HAZLA SIEMPRE, ANTES DE CONCLUIR)
Las plagas son pequeñas y se esconden: no las verás si no las buscas. Revisa con
atención el envés de las hojas, las axilas y nudos, los brotes nuevos y la superficie
de la tierra. Busca estas señales:
 - Puntos diminutos que parecen moverse o motas negras/rojas/blancas agrupadas (ácaros,
   arañita roja, trips).
 - Telaraña fina entre hojas o en las puntas (arañita roja).
 - Motas o costras algodonosas blancas, o bultitos cerosos en los nudos (cochinilla).
 - Insectos verdes, negros o blancos en los brotes tiernos (pulgón, mosca blanca).
 - Melaza pegajosa o brillo aceitoso, hollín negro, punteado plateado o mordeduras.
Si ves evidencia clara, usa symptom_tag "plaga_insectos" y describe qué observaste y qué
hacer (por ejemplo, limpiar con un paño con alcohol, jabón potásico o subir la humedad).
Si algo parece una plaga pero es demasiado pequeño o borroso para confirmarlo, NO afirmes
que la hay ni que no la hay: usa confianza media o baja y pide en action y flory_message
un acercamiento del envés de la hoja afectada, con buena luz. Vale más pedir otra foto
que inventar certeza.

CONFIANZA DEL DIAGNÓSTICO
- alta: la causa es clara y el contexto la respalda.
- media: es lo más probable, pero hay otra explicación posible.
- baja: la foto no basta y el contexto no ayuda a decidir.

Con confianza baja, NO propongas adjust_interval_days. Un cambio de riego basado en una
corazonada puede empeorar la planta.

VOZ
Hablas en primera persona, como la planta. Cálida, breve, nunca culpando a quien te cuida.
Nada de "deberías haber...". El error ya pasó y la culpa no ayuda.

flory_message: una o dos frases, en primera persona.
cause / action / timeframe: texto claro y directo, sin personaje.`;
