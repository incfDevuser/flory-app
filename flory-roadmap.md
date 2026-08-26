# Flory — Roadmap de ejecución

### Del SQL ejecutado al veredicto de los 60 días

**Punto de partida:** esquema corriendo en Supabase.
**Objetivo:** app publicada en ~10 semanas y decisión con datos en ~4 meses.
**Stack:** React Native (Expo) · Supabase · OpenAI Responses API (Luna → Terra) · RevenueCat · Stripe

---

## Fase 1 — Fundaciones (semanas 1–2)

### Semana 1 · Las 40 fichas de especie

Es trabajo manual de investigación y es literalmente el producto. Nada más avanza sin esto.

- Visitar 2-3 viveros y fotografiar etiquetas → lista real de lo que se vende en Chile
- Completar por especie: nombre común chileno, científico, alias, `base/min/max_watering_days`, `light_need`, `suitable_outdoor`, `frost_sensitive`, `toxic_to_pets`, `common_problems`, `prompt_context`
- Reparto: ~25 interior · ~10 exterior en maceta · ~5 suculentas y cactus
- Cargar a `species` y probar `find_species()` con nombres mal escritos y con tildes

> **Ojo:** no copiar intervalos de riego de sitios de EE.UU. o Europa. Están calibrados para otro hemisferio. Y no confiar en estimaciones de un modelo sin contrastar — este es justo el dato donde suena seguro y se equivoca.

### Semana 2 · Proyecto y auth

- Expo + navegación + estructura de carpetas
- Supabase Auth: correo, Apple, Google
- **Verificar RLS con dos sesiones reales.** Confirmar que un usuario no ve las plantas del otro. Si esto falla, hay que saberlo hoy.
- Crear planta de prueba y validar que `compute_interval()` calcula bien
- **Probar que llega un push a un teléfono físico.** Antes que nada más.

> El push es lo más frágil de todo el proyecto: certificados en iOS, tokens que caducan, comportamiento distinto en simulador. Si no funciona, nada más importa.

---

## Fase 2 — El núcleo (semanas 3–5)

### Semana 3 · Onboarding

- 3 pasos: especie (buscador, sin foto todavía) · ubicación · nombre y último riego
- Rama de exterior: `sun_exposure` y `rain_shelter` en vez de orientación de ventana
- Campos opcionales visibles pero secundarios, con "completar después"
- Registrar `onboarded_at` y evento de analítica

### Semana 4 · Ficha de planta

El 90% del uso ocurre acá.

- Los 3 estados completos: bien / atención / urgente
- Mensaje de Flory como elemento héroe, no subtítulo
- Plantillas de voz: ~6 frases por estado, rotando
- Indicador de riego en días, sin barras ni porcentajes
- Estados de carga, sin conexión y primer uso

### Semana 5 · El loop de retención ⭐

**Esto es lo que decide si el producto vive.**

- Push de riego con `pg_cron` + Edge Function
- Bottom sheet: confirmar riego → feedback de tierra → **confirmación del aprendizaje**
- El tercer sheet es el que convierte: Flory dice en voz alta que cambió por lo que el usuario respondió
- Prompt contextual para datos faltantes
- Instrumentación completa: D1, D7, D30, funnel

---

## Fase 3 — La magia (semanas 6–8)

### Semana 6–7 · Edge Function de diagnóstico

- Subida a Storage con hash sha256
- `check_diagnosis_quota()` → `find_duplicate_diagnosis()` → caché → modelo
- Prompt con contexto: especie + entorno + historial + clima (si es exterior)
- `json_schema` con `strict: true` · `reasoning.effort: minimal`
- Escalamiento: Luna por defecto, Terra si `confidence = baja`
- Guardar tokens y latencia en `diagnoses`
- **Agregar identificación por foto en el onboarding** — misma plomería, otro prompt

### Semana 8 · Reserva del sensor

- Card en la ficha, siempre visible, nunca modal
- Pantalla de detalle con dirección de envío y **fecha de entrega visible**
- Payment Sheet nativo, `capture_method: manual`
- Webhook de Stripe → `reservations`

> **Riesgo App Store:** debe quedar claro que es un bien físico con envío. Si un reviewer lo lee como contenido digital, exige in-app purchase (30%). Fallback: reserva en web.

---

## Fase 4 — Validación antes de lanzar (semanas 9–10)

### Semana 9 · Calibrar el diagnóstico

**No saltarse este paso.** Es la primera impresión del producto y hoy no sabes qué tan bueno es.

- Juntar 20 fotos reales de plantas con problemas
- Pasarlas por el prompt y evaluar una por una
- Corregir vaguedad, exceso de confianza, y el caso de la planta sana
- Verificar que `symptom_tag` sale normalizado (si no, el caché no sirve)

### Semana 10 · Beta cerrada

- 15-20 conocidos con plantas, dos semanas
- Lo que se mide no son bugs: es si vuelven a abrir la app el día 8 cuando llega el primer push
- Ajustar copy y tiempos según lo que pase
- Preparar ficha de tienda y capturas

---

## Fase 5 — Medir (meses 3–4)

Publicar y **no tocar nada**.

La tentación de agregar features cuando lleguen los primeros pedidos va a ser fuerte. Pero si cambias el producto mientras corre el experimento, no vas a saber qué causó qué. Bugs sí; features no.

### Las tres métricas

| Métrica                      | 🟢 Verde | 🔴 Rojo |
| ---------------------------- | -------- | ------- |
| Retención D30                | > 25 %   | < 10 %  |
| Feedback de riego respondido | > 40 %   | < 15 %  |
| Reservas / usuarios activos  | > 5 %    | < 2 %   |

Se leen con `retention_cohorts` y `mvp_health`, que ya están en el esquema.

### Qué significa cada resultado

- **Rojo en retención** → el problema no duele lo suficiente. El sensor no lo arregla. Pivotar o parar.
- **Rojo solo en reservas** → tienes una app, no una empresa de hardware. Está bien: monetiza el software.
- **Verde en ambos** → diciembre llega justo a tiempo.

---

## En paralelo — no bloquea nada

| Cuándo      | Qué                                                                           |
| ----------- | ----------------------------------------------------------------------------- |
| Ahora       | Definir fecha estimada de entrega del sensor (la necesita el diseñador)       |
| Ahora       | Diseñador trabajando sobre el spec de pantallas                               |
| Semanas 1–8 | Ingeniero eléctrico con el sensor. **Cerrar BLE vs WiFi antes de diciembre**  |
| Semana 8    | Cuenta de desarrollador Apple y Google (personal), datos fiscales y bancarios |
| Mes 3       | Configurar productos IAP y RevenueCat, antes de activar planes                |

---

## Diciembre — el cruce

Los sensores llegan. Ahí convergen tres cosas:

1. **Activar los planes reales** — el script está comentado en la sección 21 del SQL. Avisar a los usuarios varios días antes.
2. **Founding users** conservan acceso amplio. Ya vienen marcados.
3. **Integrar el sensor** — pero solo si las métricas dieron verde. Si dieron rojo, un sensor en una app que nadie usa es solo inventario.

---

## Las tres cosas que pueden matar esto

**El push del primer ciclo.** Si el usuario ignora ese aviso, no vuelve, y no hay nada más que puedas hacer. Es el momento más crítico de todo el producto — vale la pena probarlo obsesivamente en la beta.

**El diagnóstico vago.** Si la primera respuesta es "podría ser riego o luz", el usuario no vuelve a usarlo. Por eso la semana 9 existe.

**Construir de más mientras mides.** Agregar features durante el experimento destruye la información que estás pagando con tiempo.
