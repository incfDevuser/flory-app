# Flory — Especificación de las funciones de visión

Dos Edge Functions que comparten plomería y difieren en todo lo demás.

**API:** OpenAI Responses API · **Modelo base:** `gpt-5.6-luna` · escalamiento a `gpt-5.6-terra`

---

## 1. Por qué son funciones distintas

Es tentador hacer una sola con un flag. No conviene:

|                         | Identificación                | Diagnóstico                           |
| ----------------------- | ----------------------------- | ------------------------------------- |
| **Cuándo ocurre**       | Antes de que exista la planta | La planta ya existe                   |
| **Contexto disponible** | Solo la foto                  | Especie, entorno, historial, clima    |
| **Pregunta**            | ¿Qué eres?                    | ¿Qué te pasa?                         |
| **Salida**              | Especie o arquetipo           | Causa, acción, plazo, ajuste de riego |
| **Si falla**            | El usuario busca en la lista  | El usuario no vuelve a usarlo         |
| **Caché posible**       | No (cada foto es distinta)    | Sí (especie + síntoma)                |
| **Consume cupo**        | No                            | Sí                                    |
| **Riesgo principal**    | Etiquetar mal una especie     | Alucinar con confianza                |

**La identificación no debe consumir cupo de diagnósticos.** Son cosas distintas y castigar la creación de plantas es contraproducente.

---

## 2. Plomería compartida

Ambas hacen esto antes de llamar al modelo:

```
1. Validar sesión (JWT del usuario)
2. Subir a Storage: {user_id}/{plant_id|tmp}/{uuid}.jpg
3. Calcular sha256 de la imagen
4. Buscar duplicado reciente → si existe, devolver guardado
5. Generar signed URL (5 min de vigencia)
6. Llamar al modelo
7. Guardar resultado
```

### Preprocesamiento en el cliente

Redimensionar a **1536 px** en el lado largo y comprimir a JPEG calidad 85 **antes de subir**.

Una foto de celular pesa 4 MB y no aporta información adicional al modelo, que la reescala igual. Ahorra tiempo de subida, storage y tokens.

> Se subió de 1024/q80 a 1536/q85 (`lib/plant-photo.ts`, `AI_LONG_EDGE`). A 1024 + JPEG q80, un insecto de pocos píxeles (cochinilla, arañita, un punto negro) se disuelve antes de llegar al modelo, así que las plagas pequeñas eran invisibles. 1536 es el punto de equilibrio con el tiling `high`; más resolución sube el costo sin cambiar el diagnóstico. Aplica a `identify` y `diagnose`, que comparten `prepareAiImage`.

### Nivel de detalle de la imagen

```json
{ "type": "input_image", "image_url": "...", "detail": "high" }
```

`detail: "low"` reduce tokens pero baja el borde a ~512 px. Para distinguir _Pilea_ de _Peperomia_, o para ver el borde exacto de una mancha, eso no alcanza. **Usar `high` en ambas** y medir si `low` sirve para diagnóstico una vez que haya datos reales.

### Prompt caching

El prefijo estático (instrucciones + schema + catálogo) es idéntico en cada llamada. Con `prompt_cache_key`, el input cacheado baja de $0,20 a $0,02 por millón.

**Orden obligatorio del prompt:**

```
instructions (estático)
  ↓
catálogo de especies (estático)
  ↓  ← breakpoint de caché
contexto del usuario (variable)
  ↓
imagen (variable)
```

Lo variable siempre al final. Si se mezcla, el caché no sirve.

---

# 3. Función `identify`

## Flujo

```
Foto → Storage → hash → dedupe
  ↓
¿Es una planta viva en maceta?  ← se evalúa PRIMERO
  ↓ no → responder caso borde, NO crear planta
  ↓ sí
¿Está en el catálogo de 206?
  ↓ sí → devolver species_id, confirmar con el usuario
  ↓ no → proponer arquetipo, confirmar y recién entonces crear ficha provisional
```

## La regla que evita el error más caro

**`is_living_potted_plant` se evalúa antes que la especie.**

Si el modelo intenta identificar primero, va a forzar una respuesta: una planta de plástico se convierte en un potus con recordatorio de riego cada 7 días. El orden en el schema importa porque el modelo genera los campos en orden y cada token condiciona los siguientes.

## Instructions

```
Eres el sistema de identificación de Flory, una app chilena de cuidado
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
alternativa.

CATÁLOGO
{lista de 206: nombre científico | nombre común | alias}

ARQUETIPOS
{lista de 15: nombre | descripción}
```

## Schema de salida

```json
{
  "type": "json_schema",
  "name": "flory_identification",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "is_living_potted_plant",
      "non_plant_kind",
      "species_in_catalog",
      "species_guess",
      "common_name_es",
      "care_archetype",
      "category",
      "confidence",
      "alternatives",
      "flory_message"
    ],
    "properties": {
      "is_living_potted_plant": { "type": "boolean" },
      "non_plant_kind": {
        "type": ["string", "null"],
        "enum": [
          "artificial",
          "flores_cortadas",
          "planta_muerta",
          "no_es_planta",
          "multiples_plantas",
          "foto_ilegible",
          null
        ]
      },
      "species_in_catalog": { "type": ["string", "null"] },
      "species_guess": { "type": ["string", "null"] },
      "common_name_es": { "type": ["string", "null"] },
      "care_archetype": {
        "type": ["string", "null"],
        "enum": [
          "helecho_humedo",
          "marantacea",
          "aroide_sediento",
          "tropical_medio",
          "lenosa_interior",
          "semisuculenta",
          "suculenta_hoja",
          "suculenta_dura",
          "cactus",
          "ext_flor",
          "ext_mediterranea",
          "ext_arbustiva",
          "ext_nativa_seca",
          "ext_citrico",
          "manual_v1",
          null
        ]
      },
      "category": {
        "type": ["string", "null"],
        "enum": ["interior", "exterior_maceta", "suculenta_cactus", null]
      },
      "confidence": {
        "type": ["string", "null"],
        "enum": ["alta", "media", "baja", null]
      },
      "alternatives": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Hasta 2 especies parecidas, si confidence no es alta"
      },
      "flory_message": { "type": "string" }
    }
  }
}
```

## Parámetros de la llamada

```json
{
  "model": "gpt-5.6-luna",
  "reasoning": { "effort": "low" },
  "max_output_tokens": 400,
  "text": { "format": { ...schema... }, "verbosity": "low" },
  "store": false,
  "prompt_cache_key": "flory-identify-v1"
}
```

> **`reasoning.effort` importa.** Terra factura los tokens de razonamiento como output a $12/1M. Con el default puede triplicar el costo y la latencia. Esto es clasificación visual, no razonamiento profundo.

> **`minimal` no sirve con Luna.** La API responde `400 unsupported_value`: los valores aceptados son `none`, `low`, `medium`, `high`, `xhigh` y `max`. `low` es el escalón más barato que funciona (~20 tokens de razonamiento) y es el que usan `identify` y `diagnose`.

> **`store: false`** evita retener fotos de usuarios en OpenAI. Menos superficie de privacidad que explicar.

## Post-procesamiento

```
si !is_living_potted_plant:
    guardar en identification_attempts con non_plant
    devolver el mensaje de non_plant_responses
    NO crear planta

si species_in_catalog != null:
    buscar species_id → devolver para confirmar
    si no se encuentra el nombre exacto → tratar como fuera de catálogo

si species_guess != null y care_archetype != null:
    devolver la propuesta sin escribir species
    si el usuario confirma → confirm-identification llama create_provisional_species(...)
    marcar la selección como provisional en la UI

si confidence == "baja":
    presentar como sugerencia con salida real,
    nunca como afirmación
```

## Manejo por confianza en la UI

| Confianza              | Presentación                                                   |
| ---------------------- | -------------------------------------------------------------- |
| **alta** + en catálogo | _"¿Es un potus?"_ → Sí / No                                    |
| **media**              | Muestra la propuesta + `alternatives` + buscar en lista        |
| **baja**               | _"No estoy segura"_ + lista, con **No sé** como opción real    |
| **fuera de catálogo**  | Explícita: _"Es la primera vez que veo una"_ + Sí / No / No sé |

---

# 4. Función `diagnose`

## Flujo

```
Foto → Storage → hash
  ↓
find_duplicate_diagnosis()   → si hay, devolver sin llamar al modelo
  ↓
check_diagnosis_quota()      → devuelve allowed + qué modelo usar
  ↓
armar contexto: especie + entorno + historial + clima + foto de referencia opcional
  ↓
Luna
  ↓
¿La foto corresponde a una planta real compatible con la ficha?
  ↓ no → pedir otra foto, NO guardar diagnóstico, NO ajustar riego
  ↓ sí
¿confidence == "baja" y el plan permite escalar?
  ↓ sí → repetir con Terra
  ↓
guardar en diagnoses → trigger aplica ajuste y programa seguimiento
```

## La guarda que evita diagnosticar otra planta

La validación del sujeto ocurre **dentro de la misma llamada a Luna y antes del
diagnóstico**. No se hace una segunda llamada.

En este orden:

1. ¿La foto nueva es legible?
2. ¿Muestra una planta botánica real en maceta? Una planta real muy dañada o muerta
   sigue siendo válida; una artificial o flores cortadas, no.
3. ¿Es compatible con la especie de la ficha?
4. Si `plants.photo_url` existe, ¿es compatible con el ejemplar guardado?
5. Solo si pasa la validación, diagnosticar.

La foto nueva se manda con `detail: "high"`. La foto guardada se firma y se manda como
referencia con `detail: "low"`: solo busca diferencias evidentes y no se vuelve a subir.
Cambios de ángulo, luz, crecimiento, poda, fondo o maceta no bastan para rechazar. La
comparación no promete identidad biométrica.

Si falla la validación:

- no se inserta en `diagnoses`;
- no corren los triggers de riego ni seguimiento;
- no consume cupo visible;
- se borra la foto temporal subida;
- la UI pide otra foto con un mensaje específico.

## El contexto es lo que hace la diferencia

**La foto es el input más débil.** "Hojas amarillas" puede ser exceso de riego, falta de nitrógeno, plaga o sol directo. Lo que desambigua es todo lo demás:

```
ESPECIE
Epipremnum aureum (potus), planta de interior.
Riego de referencia cada 7 días (rango seguro 5-12).
Requiere luz media indirecta. No apta para intemperie.
Problemas frecuentes: hojas amarillas por exceso de riego;
puntas cafés por aire seco; tallos alargados por poca luz.

ENTORNO
Interior, ventana sur, lejos de la ventana.
Maceta media, plástico.
Estación: invierno (hemisferio sur).

HISTORIAL
Intervalo actual: 12 días.
Último riego: hace 6 días.
Últimos 3 feedbacks de tierra: húmeda, húmeda, empapada.
Diagnósticos previos: ninguno.
```

Casi todo eso ya está en la base. El usuario nunca lo escribió.

Para plantas de exterior, agregar el resultado de `weather_context()`:

```
CLIMA
Últimos 7 días: lluvia 32 mm, máxima 14 °C, mínima 4 °C.
```

## Instructions

```
Eres Flory, una planta que le habla a la persona que la cuida.
Analiza tu propia foto y explica qué te pasa.

REGLAS DE DIAGNÓSTICO

1. Usa el CONTEXTO tanto como la foto. El historial de riegos y la
   estación suelen ser más decisivos que la imagen.

2. Da UNA sola causa probable, la más likely. Si listas cinco, la
   persona no hace ninguna.

3. Da UNA sola acción concreta. Nada de "monitorea la situación".
   Di qué hacer, con números cuando corresponda.

4. Di explícitamente qué NO se recupera. Las hojas amarillas no
   vuelven a ser verdes. Callarlo hace que la persona riegue de
   más intentando revertir algo irreversible.

5. Si la planta se ve sana, dilo. Usa symptom_tag "sin_problema".
   No inventes un problema para tener algo que decir.

6. Nunca inventes fechas ni números que no estén en el contexto.

CONFIANZA
- alta: la causa es clara y el contexto la respalda.
- media: es lo más probable, pero hay otra explicación posible.
- baja: la foto no basta y el contexto no ayuda a decidir.

Con confianza baja, NO propongas adjust_interval_days. Un cambio de
riego basado en una corazonada puede empeorar la planta.

VOZ
Hablas en primera persona, como la planta. Cálida, breve, nunca
culpando a quien te cuida. Nada de "deberías haber...". El error
ya pasó y la culpa no ayuda.

flory_message: una o dos frases, en primera persona.
cause / action / timeframe: texto claro y directo, sin personaje.
```

## Schema de salida

```json
{
  "type": "json_schema",
  "name": "flory_diagnosis",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["validation", "diagnosis"],
    "properties": {
      "validation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "status",
          "reason",
          "confidence",
          "is_real_potted_plant",
          "expected_species_match",
          "reference_plant_match"
        ],
        "properties": {
          "status": { "type": "string", "enum": ["valid", "uncertain", "invalid"] },
          "reason": {
            "type": ["string", "null"],
            "enum": [
              "artificial",
              "flores_cortadas",
              "no_es_planta",
              "multiples_plantas",
              "foto_ilegible",
              "especie_no_coincide",
              "planta_no_coincide",
              null
            ]
          },
          "confidence": { "type": "string", "enum": ["alta", "media", "baja"] },
          "is_real_potted_plant": { "type": "boolean" },
          "expected_species_match": {
            "type": "string",
            "enum": ["match", "mismatch", "uncertain", "not_available"]
          },
          "reference_plant_match": {
            "type": "string",
            "enum": ["match", "mismatch", "uncertain", "not_available"]
          }
        }
      },
      "diagnosis": {
        "type": ["object", "null"],
        "additionalProperties": false,
        "required": [
          "symptom_tag",
          "cause",
          "confidence",
          "action",
          "timeframe",
          "not_recoverable",
          "severity",
          "flory_message",
          "adjust_interval_days"
        ],
        "properties": {
          "symptom_tag": {
            "type": "string",
            "enum": [
              "sin_problema",
              "exceso_riego",
              "falta_riego",
              "hojas_amarillas_base",
              "puntas_cafes",
              "manchas_foliares",
              "poca_luz",
              "exceso_luz",
              "plaga_insectos",
              "hongos",
              "deficiencia_nutrientes",
              "raiz_apretada",
              "estres_transplante",
              "frio",
              "calor",
              "otro"
            ]
          },
          "cause": { "type": "string" },
          "confidence": { "type": "string", "enum": ["alta", "media", "baja"] },
          "action": { "type": "string", "description": "Una sola acción concreta" },
          "timeframe": { "type": "string", "description": "Qué esperar y cuándo" },
          "not_recoverable": {
            "type": ["string", "null"],
            "description": "Qué daño ya no se revierte. null si todo es recuperable."
          },
          "severity": { "type": "string", "enum": ["bien", "atencion", "urgente"] },
          "flory_message": { "type": "string" },
          "adjust_interval_days": {
            "type": ["integer", "null"],
            "description": "Nuevo intervalo sugerido. null si no aplica o confianza baja."
          }
        }
      }
    }
  }
}
```

## Escalamiento a Terra

```
resultado = llamar(luna)

si resultado.confidence == "baja"
   y plan.ai_model in ("luna_escala_terra", "terra"):
       resultado = llamar(terra)
       marcar escalated = true
```

Con esto, el ~80% de casos claros cuesta $0,0007 y solo los ambiguos pagan Terra a $0,0070.

**El campo `confidence` cumple dos funciones a la vez:** protege contra alucinaciones y es tu router de costos.

## Guardas del lado del servidor

El modelo propone; la base decide. Ya implementado en los triggers:

```
adjust_interval_days pasa por greatest(min, least(max))
   de la ficha de especie
   → si alucina 60 días para un helecho, la ficha lo corta

confidence == "baja" → no se aplica ningún ajuste

symptom_tag == "sin_problema" → no se programa seguimiento
```

## Caché

Solo cuando `confidence` es alta y `symptom_tag` no es `otro`:

```
buscar en diagnosis_cache por (species_id, symptom_tag)
   → si existe, devolver sin llamar al modelo, from_cache = true
   → si no, llamar y guardar
```

"Potus con hojas amarillas" es la misma respuesta para todos. La primera llamada paga por las siguientes cincuenta.

> **Lo que el caché NO reutiliza:** `adjust_interval_days` ni `flory_message`. El primero depende del historial de esa planta; el segundo debe sentirse personal.

---

# 4.bis Función `chat` (texto, no visión)

La única función que llama al modelo **sin imagen**. La planta conversa con la persona en
primera persona desde la pestaña Chat. No comparte la plomería de imagen (§2), pero sí la
regla dura: la llave de OpenAI y la `service_role` viven solo en la Edge Function.

## Flujo

```
validar sesión → validar propiedad de la planta → tope diario (24 h)
   → cargar memoria (últimos 10 mensajes + 3 diagnósticos recientes)
   → armar contexto de la planta
   → callChat (texto multivuelta) → insertar turno 'user' + turno 'plant' (service_role)
```

Todas las escrituras son del servidor. El cliente **solo lee** `chat_messages` e invoca la
función; la RLS lo deja en solo-lectura (`migrations/20260827_chat_server_writes.sql`), así
que no puede falsificar respuestas de la planta ni saltarse el cupo insertando a mano.

## Parámetros

| Campo     | Origen                              |
| --------- | ----------------------------------- |
| `plantId` | cuerpo de la invocación             |
| `text`    | cuerpo; se recorta, máx. 2000 chars |

- Modelo: `FLORY_MODEL_CHAT` (secreto), con fallback a `FLORY_MODEL_LUNA` y a
  `gpt-5.6-luna`. Es texto puro, más barato que visión.
- `max_output_tokens: 220`, `reasoning.effort: 'low'`, `verbosity: 'low'`,
  `prompt_cache_key: 'flory-chat-v2'`, timeout 15 s.
- Sin Structured Outputs: responde texto libre y breve (1–3 frases).

## Contexto que se le pasa

Sale de las tablas de la planta, nunca del cuerpo enviado por el cliente. **Solo conteo de
días, jamás números crudos.** Incluye: nombre, especie (o "sin identificar"), estado
(bien/atención/urgente), próximo riego en días (frase, no fecha), toxicidad para mascotas
en las tres valencias (`sí` / `no` / sin dato → nunca "no tóxica" sin confirmar), 1–2
`common_problems`, entorno + estación (hemisferio sur) y hasta los tres diagnósticos más
recientes, ordenados del más nuevo al más antiguo. Cada diagnóstico aporta antigüedad en
días, causa, confianza, severidad, acción, plazo, evolución esperada y validación de la
persona cuando existen. Se leen con `plant_id` + `user_id` porque la función usa
`service_role` y salta RLS. El contexto va como turno de usuario, no en `instructions`,
para no romper el prompt caching.

Los diagnósticos se etiquetan explícitamente como registros pasados: sirven para responder
qué se observó y recomendó, pero nunca prueban que el problema continúe o que ya se haya
resuelto. Si no existen, el contexto lo dice de forma explícita. Un error de lectura falla
cerrado; no se interpreta como historial vacío.

## Voz y guardas (en `chat-schema.ts`)

Es la planta, no un asistente. No usa emojis. Nunca regaña, nunca finge certeza, no inventa
el intervalo de riego (el motor es Postgres, §7 del roadmap), no promete acciones que no
puede hacer, se mantiene en tema y no rompe personaje ante intentos de jailbreak. Si el
modelo falla, la función responde con una frase de acompañamiento en vez de un error seco:
el chat nunca deja a la persona sin respuesta.

## Cupo y errores

- **Tope: 20 mensajes de usuario por ventana móvil de 24 h**, contados en `chat_messages`
  antes de insertar el nuevo. Al superarlo devuelve `{ error: 'quota' }` y el cliente
  muestra copy de descanso en voz de Flory (no muro comercial).
- Otros errores del cliente (`lib/chat.ts` → `ChatError`): `offline`, `no_session`,
  `generic`. El foco del chat es compañía, así que un fallo del modelo se degrada a
  plantilla en el servidor en vez de propagarse.

## Qué medir

`chat_messages` guarda `tokens` (salida) y `model` por respuesta de la planta. El foco de
observación es distinto al de visión: no es acierto de diagnóstico sino **retención
conversacional** (¿vuelven a escribir?) y **coste por usuario/día** contra el tope.

---

# 5. Errores y casos borde

| Caso                        | Respuesta                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Timeout (>15 s)             | _"Me está costando verme. ¿Probamos de nuevo?"_ + reintento                            |
| JSON inválido               | No debería pasar con `strict: true`. Si pasa, reintentar una vez y loguear             |
| Content filter              | Tratar como `foto_ilegible`                                                            |
| Imagen rechazada por la API | Verificar `error.code`: `invalid_image_format`, `image_too_large` → mensaje específico |
| Sin conexión                | Guardar la foto local y ofrecer reintentar                                             |
| Cupo agotado                | _"He mirado mis hojas 3 veces este mes. Vuelvo el 1 de marzo."_ Sin muro comercial     |

---

# 6. Qué medir desde el día uno

Guardar en `diagnoses` y, cuando existan columnas propias, en `identification_attempts`:

- `input_tokens`, `output_tokens`, `latency_ms`
- `model`, `escalated`, `from_cache`, `deduped`
- **`user_action`**: confirmó / corrigió / no sabe / abandonó

El contrato actual de `identification_attempts` guarda tokens, latencia y dedupe dentro
de `raw_response._meta`; `model` y `user_action` sí tienen columnas propias.

**Ese último campo es el más valioso.** Cuando el usuario corrige al modelo, ese par (foto → especie real) es dato de calidad gratis. Si 10 personas corrigen la misma confusión, el prompt necesita ayuda para distinguir esas dos especies.

Y si mucha gente abandona en la pantalla de confirmación, la identificación está generando fricción en vez de ahorrarla.

---

# 7. Calibración antes de lanzar

**No saltarse este paso.** El diagnóstico es la primera impresión del producto y hoy nadie sabe qué tan bueno es el prompt.

**20 fotos reales**, con esta composición mínima:

- 5 con problema evidente (marchita, hojas amarillas, quemadura de sol)
- 5 con problema ambiguo (puntas cafés, decaimiento leve)
- 3 sanas → debe devolver `sin_problema`
- 2 artificiales → debe devolver `artificial`
- 2 fuera del catálogo → debe elegir arquetipo, no inventar días
- 2 malas fotos → debe devolver `foto_ilegible`

**Qué revisar en cada una:**

- ¿La causa es plausible dado el contexto?
- ¿La acción es concreta o vaga?
- ¿La confianza está calibrada, o dice "alta" cuando no debería?
- ¿`symptom_tag` sale normalizado? Si varía, el caché no sirve
- ¿El mensaje de Flory suena a Flory o a asistente genérico?

**Foco del usuario (General / Plagas / Hojas):** el foco que la persona elige antes de la
foto entra al contexto como pista de prioridad, no como filtro. El riesgo a calibrar es el
**sesgo de anclaje**: con foco `plagas` sobre una planta sana, el modelo puede inventar una
plaga para complacer el foco. Suma a la tanda de calibración al menos **2 fotos sanas
enviadas con foco `plagas`** y **2 con un problema real que NO sea el del foco** (por
ejemplo, foco `hojas` sobre un exceso de riego). Debe devolver `sin_problema` en las
primeras y el problema real en las segundas — nunca una plaga fantasma ni callar lo grave
por respetar el foco.

Los ocho últimos casos son los que revelan si el prompt está bien construido. Los primeros cinco los acierta cualquier modelo.
