# Flory — Spec de pantallas

### Documento de diseño · 24 rutas + 4 bottom sheets

**Alcance:** MVP sin sensor físico. Una planta obligatoria, hasta 8 opcionales.
**Objetivo del producto:** retención a 30 días y validar intención de compra del sensor.

Lee primero el _Manual para el equipo móvil_. Este documento asume esos principios.

---

## Reglas que aplican a todas las pantallas

**1. Flory habla, la app no.** Todo texto al usuario va en primera persona de la planta. Excepción: pantallas transaccionales (auth, pago, envío), que hablan en tono neutro — cuando alguien pone su tarjeta necesita sentir que trata con una empresa.

**2. Una acción principal por pantalla.** Si hay dos botones del mismo peso, algo está mal.

**3. Nada de rojo.** El estado urgente va en coral o naranja. El rojo dispara culpa y el usuario ya llega con culpa.

**4. Nada de números crudos.** Ni porcentajes, ni lux, ni gráficos. Si aparece un número es un conteo de días.

**5. Cada pantalla necesita 5 estados:** normal · cargando · vacío · error · sin conexión. Están detallados solo donde no son obvios.

**6. Toda pantalla con scroll necesita safe area** — notch arriba, barra de gestos abajo.

---

## Sistema visual base

### Los tres estados de planta

| Estado       | Cuándo                                | Color       | Ilustración                    |
| ------------ | ------------------------------------- | ----------- | ------------------------------ |
| **Bien**     | Falta más de 1 día para regar         | Verde       | Planta erguida, hojas abiertas |
| **Atención** | Toca hoy o mañana, o diagnóstico leve | Ámbar suave | Ligeramente caída              |
| **Urgente**  | Atrasado 3+ días, o diagnóstico grave | Coral       | Marchita, sin dramatismo       |

La ilustración debe funcionar a 240px (Home) y a 48px (lista). Debe verse bien sobre la foto real si el usuario subió una.

### Tipografía

Máximo 2 pesos, 4 tamaños:

- **Display** — el mensaje de Flory en el Home
- **Título** — nombres de pantalla y de planta
- **Cuerpo** — texto general
- **Caption** — datos secundarios, nombre científico

### Componentes a diseñar una vez

Botón primario · botón secundario · botón texto · input · selector de 3 opciones (tipo segmented) · card · bottom sheet · chip de estado · avatar de planta (con badge de estado) · banner informativo · empty state.

---

# (auth)

Tono neutro en todas. Flory todavía no se presentó como personaje.

---

## `welcome`

**Propósito:** comunicar la promesa en 3 segundos. Es lo primero que ve alguien que acaba de descargar.

**Contenido:**

- Ilustración de Flory, grande, estado "bien"
- Titular: **"Tu planta te habla"**
- Subtítulo: _Flory te dice qué necesita tu planta y cuándo, sin que tengas que adivinar._
- Botón primario: **Empezar**
- Botón texto: **Ya tengo cuenta**

**Decisiones:**

- **Sin carrusel de 4 slides.** Quien descargó ya está convencido; hacerlo leer es fricción.
- Sin scroll. Todo cabe en una pantalla.

**Estados:** solo normal.

---

## `sign-in`

**Contenido:**

- Título: "Hola de nuevo"
- Input correo (teclado email, autocomplete, sin autocapitalize)
- Input contraseña (toggle mostrar/ocultar)
- Botón texto alineado a la derecha: **¿Olvidaste tu contraseña?**
- Botón primario: **Entrar**
- Separador "o"
- **Continuar con Apple** (obligatorio en iOS si hay login social)
- **Continuar con Google**
- Al pie: _¿No tienes cuenta?_ **Regístrate**

**Estados:**

- Cargando: botón con spinner, inputs deshabilitados
- Error de credenciales: mensaje bajo el formulario, no alert nativo. _"Correo o contraseña incorrectos"_ — nunca especificar cuál de los dos, es una fuga de información
- Sin conexión: banner arriba, botón deshabilitado

**Detalle:** el teclado no debe tapar el botón. Scroll con `KeyboardAvoidingView`.

---

## `sign-up`

**Contenido:**

- Título: "Creemos tu cuenta"
- Input correo
- Input contraseña, con requisitos visibles **antes** de escribir, no como error después
- Checkbox o texto: acepto términos y privacidad, con links reales
- Botón primario: **Crear cuenta**
- Login social igual que sign-in
- Al pie: _¿Ya tienes cuenta?_ **Entrar**

**Estados:**

- Correo ya registrado: ofrecer ir a login con el correo prellenado
- **Confirmación por correo:** si está activada, pantalla intermedia — _"Te enviamos un correo a X. Ábrelo para continuar."_ con botón de reenviar (con cooldown de 60 s)

---

## `forgot-password`

**Contenido:**

- Título: "Recuperar contraseña"
- Texto: _Te enviaremos un enlace para crear una nueva._
- Input correo
- Botón primario: **Enviar enlace**

**Después de enviar:** misma pantalla, contenido reemplazado por confirmación. _"Revisa tu correo"_ + botón **Volver a entrar**.

**Detalle de seguridad:** el mensaje de éxito se muestra aunque el correo no exista. Decir "ese correo no está registrado" permite enumerar usuarios.

---

# (onboarding)

Barra de progreso de 3 pasos. "Atrás" siempre disponible. **Ningún paso se salta** — son los tres datos mínimos para calcular el riego.

Aquí Flory ya empieza a hablar.

---

## `especie`

**Propósito:** identificar la planta.

**Contenido:**

- Progreso: paso 1 de 3
- Título: "¿Qué planta tienes?"
- **Buscador** — input con ícono de lupa, foco automático
- Lista de resultados: foto miniatura · nombre común · nombre científico en caption
- Sin escribir nada: mostrar 8-10 especies más comunes como sugerencia
- Al pie, secundario: **No sé cuál es** → identificación por foto

**Sobre el buscador:**

- Busca desde el primer carácter, con debounce ~250 ms
- Tolerante a tildes y a errores de tipeo
- Encuentra por alias: escribir "sansevieria" debe traer "Lengua de suegra"

**Identificación por foto** (secundario en esta versión):

- Abre cámara → analiza → confirma
- **Si está en el catálogo:** _"¿Es un potus?"_ → **Sí** / **No, buscar**
- **Si NO está en el catálogo:** confirmación más explícita, con salida real:

  > _"Creo que eres una Pilea peperomioides, pero no estoy segura. Es la primera vez que veo una."_
  > **Sí, esa es** · **No, buscar en la lista** · **No sé**

  "No sé" debe ser una opción real, no un escape. Mejor una planta sin especie definida que una mal etiquetada.

**Casos borde — no se crea planta:**

| Caso            | Mensaje                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artificial      | _"Creo que esta compañera es artificial. Puede quedarse en tu casa para siempre y no necesita nada de mí."_                                                           |
| Flores cortadas | _"Se ven preciosas, pero son flores cortadas. Yo acompaño plantas en maceta."_                                                                                        |
| Planta muerta   | _"No alcanzo a ver tejido vivo aquí. A veces rebrotan desde la raíz, así que si quieres esperar unas semanas, avísame. Y si no, pasa: le ha pasado a todo el mundo."_ |
| No es planta    | _"No logro ver una planta en esta foto. ¿Me la sacas de nuevo, más cerca de las hojas?"_                                                                              |
| Varias plantas  | _"Veo varias plantas distintas. Sácame una foto de una sola."_ (sí puede continuar)                                                                                   |
| Foto ilegible   | _"No alcanzo a verme bien. ¿Probamos con más luz?"_                                                                                                                   |

Todos en voz de Flory. **Nunca hacen sentir tonto al usuario** — es Flory la que no alcanza a ver.

**Estados:** buscando · sin resultados (con CTA a foto) · identificando · sin conexión.

---

## `ubicacion`

**Propósito:** los factores de entorno que alimentan el cálculo de riego.

**Contenido:**

- Progreso: paso 2 de 3
- Título: "¿Dónde vive?"
- **Selector grande de 2 opciones: Interior / Exterior** — con ilustración, no solo texto

**La pantalla cambia según la elección.** No mostrar ambos sets a la vez.

### Si elige Interior

- _¿Qué ventana tiene cerca?_ → Norte · Sur · Este · Oeste · Sin ventana
- _¿Qué tan cerca está?_ → Junto a la ventana · Cerca · Lejos

### Si elige Exterior

- _¿Cuánto sol recibe?_ → Todo el día · Solo mañana · Solo tarde · Semisombra · Sombra
- _¿Le llega la lluvia?_ → Descubierta · Bajo alero · Techada

### Ambos casos, más abajo

- _¿Cómo es la maceta?_ → Chica · Media · Grande
- _¿De qué material?_ → Plástico · Greda · Cerámica · Otro

**Decisión crítica de diseño:** todo lo que está bajo el selector interior/exterior es **opcional**. Debe verse opcional — peso visual menor, y un texto al pie: _Puedes completarlo después_.

> Si parecen obligatorios, el usuario se traba. Si están escondidos, nadie los llena. Visibles pero secundarios.

**Botón:** **Continuar** (activo aunque no complete lo opcional).

---

## `nombre`

**Propósito:** el momento en que la planta deja de ser un objeto.

**Contenido:**

- Progreso: paso 3 de 3
- Título: "¿Cómo se llama?"
- Input de nombre, placeholder sugerido: _Olivia_
- Texto de apoyo: _Ponle el nombre que quieras. Así te voy a hablar._
- Separador
- _¿Cuándo la regaste por última vez?_ → **Hoy** · **Hace unos días** · **Hace más de una semana** · **No sé**
- Botón primario: **Listo**

**Decisiones:**

- **Nada de date pickers.** Nadie recuerda la fecha exacta y forzarlo genera abandono.
- Foto de la planta: opcional, se pide después. No bloquear el onboarding con permisos de cámara.

**Al terminar:** transición a la ficha con el primer mensaje de Flory. Este momento merece animación — es la primera vez que la planta "habla".

> _"Hola, soy Olivia. Estoy bien por ahora, te aviso cuando necesite algo 💚"_

---

# (tabs)

Cinco tabs. Íconos con label — sin label, nadie sabe qué es "Flory".

---

## `index` — Home

**La pantalla más importante del producto.** El 90% del uso ocurre aquí.

**Estructura vertical:**

1. **Foto de la planta** — grande, protagonista, ~40% de la altura. Si no hay foto, ilustración de Flory según estado. Toque en la foto → cámara para actualizarla.
2. **Nombre** — Olivia. Título grande.
3. **Nombre científico** — caption, discreto, bajo el nombre.
4. **Mensaje de Flory** — display, el elemento héroe de la pantalla. No es subtítulo.
5. **Próxima agua en 5 días** — cuerpo, discreto. Solo días, sin barras ni porcentajes.
6. **Botón primario: Registrar riego** — siempre disponible, no solo cuando toca.
7. **Botón secundario: Le pasa algo** — menos peso visual. Abre cámara de diagnóstico.
8. **Card de reserva del sensor** — al fondo, siempre presente, nunca modal.

**Jerarquía de los botones:** "Registrar riego" ocurre 3-4 veces al mes; "Le pasa algo" una vez cada varios meses. Si compiten visualmente, el usuario duda cada vez que abre la app.

**Orden importa:** el mensaje de Flory va **antes** de los datos técnicos. Si queda debajo de "Epipremnum aureum", se convierte en decoración.

**Múltiples plantas:** swipe horizontal, con puntitos abajo. Sin lista intermedia. El swipe mantiene el protagonismo.

**Copy por estado** (~6 variantes cada uno, rotando):

**Bien**

> _Estoy perfecta. No necesito nada por ahora 💚_
> _Todo bien por acá. Gracias por preguntar._
> _Sigo contenta en mi rincón._

**Atención**

> _Tengo un poquito de sed. Mañana estaría bien un poco de agua._
> _Me vendría bien un trago pronto._

**Urgente**

> _Tengo mucha sed. ¿Me riegas hoy?_
> _Llevo varios días esperando agua 💧_

**Card de datos faltantes** (aparece entre 5 y 6, descartable, máx. una por semana):

> _Para saber cuánta agua pierdo, ¿en qué maceta estoy?_
> **Chica** · **Media** · **Grande**

**Card de ficha provisional** (si la especie no está verificada):

> _Todavía estoy aprendiendo sobre mí. Mis tiempos son aproximados._

**Estados:**

- Cargando: skeleton, nunca pantalla en blanco
- Sin conexión: último estado conocido + banner discreto. **La ficha debe funcionar offline.**
- Primer uso sin foto: ilustración + CTA suave para agregarla

---

## `plantas` — Mis plantas

**Propósito:** navegar entre plantas cuando hay varias.

**Contenido:**

- Título: "Mis plantas"
- Grilla de 2 columnas o lista: foto · nombre · chip de estado · próximo riego
- Ordenadas por urgencia, no por fecha de creación
- FAB o botón: **Agregar planta**

**Recomendación:** ocultar esta tab hasta que el usuario tenga 3 o más plantas. Con una sola está vacía y con dos casi — y una tab que no sirve entrena a ignorar la barra completa.

**Estados:**

- Vacío (nunca debería pasar, hay al menos 1): ilustración + CTA
- Plantas congeladas (por downgrade de plan): se muestran atenuadas con candado, **nunca se ocultan ni se borran**

---

## `actividad`

**Propósito:** dar una razón para abrir la app sin push, y hacer visible que Flory aprende.

**Contenido:**

- Alertas activas arriba, si las hay: plantas urgentes, diagnósticos sin revisar
- **Timeline unificado** hacia abajo, agrupado por día:
  - 💧 Riegos, con el feedback de tierra que dio el usuario
  - 📷 Diagnósticos, con miniatura y causa
  - 🌧️ Riegos por lluvia (exterior) — _"Llovió 18 mm, no necesité agua"_
  - 🌱 Ajustes de intervalo — _"Aprendí que necesito menos agua"_
  - 🔔 Avisos enviados

**Por qué importa:** ver la historia acumulada es lo que hace sentir que la app conoce tu casa. Es el mismo activo que se pierde al cancelar.

**Estados:**

- Vacío (usuario nuevo): _"Aquí vas a ver todo lo que vamos viviendo juntas."_
- Free con historial limitado: al llegar a 30 días, mensaje suave sobre historial completo — **sin muro agresivo**

---

## `flory` — Sensor

**Propósito:** validar intención de compra. Es la métrica de la decisión.

**Antes de reservar:**

- Render o foto del sensor, grande
- Titular: **Flory Sensor**
- _Mide la humedad de mi tierra, la luz y la temperatura para que no tengas que adivinar._
- Las 4 variables, en lenguaje simple, con íconos
- Precio: **$20.990** · _Resérvalo con $5.000_
- **Fecha estimada de entrega** — visible, no en letra chica
- Botón primario: **Reservar**

**Después de reservar:**

- Estado de la reserva: número, monto autorizado, fecha estimada
- _No se te ha cobrado. Solo autorizamos el monto._
- Botón texto: **Cancelar reserva**

**Tono:** transaccional, no de planta. Aquí el usuario va a poner su tarjeta.

---

## `perfil`

**Contenido:**

- Correo del usuario
- Plan actual y, si aplica, badge de **Founding user**
- **Mis plantas** (contador) → tab plantas
- **Notificaciones** → `ajustes/notificaciones`
- **Mi reserva** → tab flory
- **Ayuda y contacto**
- **Términos** · **Privacidad**
- **Cerrar sesión**
- **Eliminar cuenta** — al pie, discreto, con confirmación de dos pasos

**Sobre eliminar cuenta:** requerido por App Store si hay registro en la app. La confirmación debe advertir que se borran las plantas y el historial.

---

# (stack sobre tabs)

---

## `plant/[id]` — Detalle completo

**Propósito:** todo lo que no cabe en el Home.

**Contenido:**

- Header con foto y nombre
- **Estado actual** y mensaje de Flory
- **Riego:** intervalo actual · último riego · próximo riego
- **Ficha de la especie:** nombre científico · necesidad de luz · si sirve en exterior · sensibilidad a heladas
- **Toxicidad para mascotas** — ⚠️ ver nota abajo
- **Su entorno:** ubicación, ventana o sol, maceta. Editable inline.
- **Historial de riegos** — lista, no gráfico
- **Diagnósticos previos** — miniaturas, tocar para ver
- **Problemas comunes de la especie**
- Al pie: **Editar** · **Archivar planta**

### ⚠️ Toxicidad para mascotas

Tres estados, y **no se pueden colapsar en dos**:

| Dato          | Cómo se muestra                                                |
| ------------- | -------------------------------------------------------------- |
| Tóxica        | _"Soy tóxica si tu mascota me mastica"_ + ícono de advertencia |
| No tóxica     | _"No soy tóxica para mascotas"_                                |
| **Sin datos** | _"No hay información confirmada sobre mi toxicidad"_           |

Hay 44 especies en el catálogo donde ASPCA simplemente no las ha evaluado. Mostrarlas como "no tóxica" es decirle a alguien que su gato puede masticarla sin riesgo cuando nadie lo verificó. **No es un matiz de copy, es seguridad.**

---

## `plant/[id]/editar`

**Contenido:**

- Foto (cambiar / eliminar)
- Nombre
- Especie (con advertencia: cambiarla recalcula el riego)
- Ubicación y todos los campos de entorno
- Botón: **Guardar**

**Al guardar cambios de entorno:** Flory avisa que recalculó.

> _Ajusté mi riego a cada 9 días._

---

## `plant/nueva`

Reutiliza los 3 pasos del onboarding, sin la barra de bienvenida.

**Diferencia:** si el usuario alcanzó el límite de plantas de su plan, esta pantalla muestra el aviso **antes** de que empiece a llenar datos. Nunca después.

---

## `diagnostico/camara`

**Contenido:**

- Vista de cámara a pantalla completa
- Guía superpuesta: _Acerca la foto a la hoja o la zona con problema_
- Botón de captura, grande y centrado
- Acceso a galería, esquina
- Cerrar, esquina opuesta

**Después de capturar:** preview con **Usar esta foto** / **Repetir**

**Estados:**

- Permiso denegado: explicar por qué se necesita, con botón a ajustes del sistema
- Sin conexión: avisar antes de capturar, no después

---

## `diagnostico/analizando`

**Propósito:** sostener 3-8 segundos de espera en el momento de mayor ansiedad del usuario.

**Contenido:**

- Animación suave, **no spinner genérico**
- Texto rotando cada ~2 s:
  - _Estoy mirando mis hojas…_
  - _Comparando con lo que sé de mí…_
  - _Casi listo…_

**Nunca dejar pantalla muerta.** El usuario cree que su planta se está muriendo.

**Si supera 15 s:** mensaje de que está tardando, con opción de cancelar.

---

## `diagnostico/[id]` — Resultado

**Tu diferenciador. La pantalla que decide si vuelven a usar el diagnóstico.**

**Estructura:**

1. **Foto que subió**, arriba
2. **Mensaje de Flory** en primera persona
   > _Creo que he tomado más agua de la que necesito 😅_
3. **Causa** — título claro: _Exceso de riego_
4. **Nivel de confianza** — visible siempre, no escondido:
   - Alta → _Estoy bastante segura_
   - Media → _Creo que es esto, pero podría ser otra cosa_
   - Baja → _No estoy segura. Vale la pena mirarlo de nuevo en unos días._
5. **Qué hacer** — acción concreta y **única**
6. **Qué esperar** — el plazo, **incluyendo lo que no se recupera**:
   > _Las hojas amarillas no se van a poner verdes otra vez, pero las nuevas deberían salir sanas._
7. **Si ajustó el riego:** _Ajusté mi próximo riego a 14 días._
8. Botón: **Recuérdame revisar en 3 semanas**
9. Botón texto: **Volver**

**Decisiones:**

- **El nivel de confianza se muestra siempre**, incluso cuando es alta. Es lo que hace a Flory confiable en vez de sabelotodo, y protege al usuario de actuar sobre un diagnóstico dudoso.
- **Una sola acción.** Si la lista tiene 5 cosas que hacer, el usuario no hace ninguna.
- Decir lo que **no** se recupera evita que riegue de más intentando revertir algo irreversible.

**Estados especiales:**

- **Planta sana:** _"Me veo bien. No detecto nada raro 💚"_ — el modelo debe poder decir "no hay problema"
- Límite de diagnósticos alcanzado: _"He mirado mis hojas 3 veces este mes. Vuelvo a estar disponible el 1 de marzo."_ Debe sentirse como pausa, no como muro comercial.
- Error del servicio: en voz de Flory, con reintento

---

## `diagnostico/[id]/seguimiento`

**Propósito:** el momento de mayor confianza en todo el producto.

**Contenido:**

- **Comparación lado a lado:** foto anterior · nueva foto
- Cámara para la nueva
- Después de analizar:
  > _¡Se ven mejor! Gracias por cuidarme 💚_
- Si no mejoró: nuevo diagnóstico, sin culpar al usuario

**Aquí la card del sensor tiene su mejor momento de conversión.** Flory acaba de demostrar que acierta.

---

## `reserva/detalle`

**Tono transaccional.** Sin voz de planta.

**Contenido obligatorio, sin letra chica:**

- Imagen del sensor
- Qué mide, en lenguaje simple
- Precio final **$20.990**
- Abono **$5.000**, **descontable del total**
- **Fecha estimada de entrega**
- **Reembolsable hasta el despacho** — prominente
- Nota: _No se te cobra ahora. Autorizamos el monto y solo se cobra cuando enviemos tu Flory._

**Formulario:** nombre completo · teléfono · dirección · comuna · región

**Botón:** **Reservar por $5.000** → Payment Sheet nativo (Apple Pay / Google Pay / tarjeta)

> ### ⚠️ Crítico para App Store
>
> Debe quedar **visualmente claro que esto es un producto físico con envío**, no contenido digital. Los campos de dirección y la fecha de entrega deben estar visibles en la misma pantalla del pago. Si un reviewer lo lee como venta digital, exige in-app purchase (30%).

**Estados:** pago rechazado · cancelado por el usuario · sin conexión durante el pago.

---

## `reserva/confirmacion`

**Contenido:**

- Confirmación visual (no confeti — es una reserva, no un premio)
- Número de reserva
- Monto autorizado, **no cobrado**
- Fecha estimada de entrega
- Cómo cancelar
- _Te enviamos un correo con los detalles._
- Botón: **Volver a mis plantas**

---

## `ajustes/notificaciones`

**Contenido:**

- Toggle maestro: **Recibir avisos**
- **Hora preferida** — selector de hora. Por defecto 9:00.
- Toggles por tipo:
  - Recordatorios de riego
  - Seguimiento de diagnósticos
  - Avisos de lluvia (solo si tiene plantas de exterior)
- Si el permiso del sistema está denegado: banner con botón a ajustes del sistema

**Por qué la hora importa:** un push a las 3 AM destruye la confianza. Y el push del primer ciclo es el momento más crítico del producto.

---

# Bottom sheets

No son rutas. No van en el router.

---

## Confirmar riego

Se abre desde **Registrar riego** o desde la notificación.

- _"¿Regaste a Olivia?"_
- **Sí, la regué** / **Todavía no**

---

## Feedback de tierra

**El corazón del producto. No lo entierres.**

- _"Antes de regar, ¿cómo estaba la tierra?"_
- Tres opciones grandes, con ilustración diferenciada:
  **Seca** · **Húmeda** · **Empapada**
- Link discreto: _No la toqué_

---

## Confirmación del aprendizaje ⭐

**La pantalla que convierte usuarios.**

Cuando el feedback cambia el intervalo, Flory lo dice explícitamente:

> _Anotado. Parece que todavía tenía agua, así que la próxima vez voy a esperar un poco más._
> **Próxima agua en 14 días**

**El usuario tiene que VER que la app cambió por algo que él dijo.** Si el ajuste ocurre en silencio, se pierde el único momento en que el producto demuestra que aprende — y eso es toda la retención.

Si el intervalo **no** cambió, no mostrar este sheet. Un "anotado" sin efecto visible es ruido.

---

## Completar datos faltantes

- Una pregunta a la vez, en voz de Flory
- Máximo una por semana
- Descartable sin costo

---

# Qué entregar

- Flujo completo navegable en Figma
- **Home en sus 3 estados**, completo
- Set de ilustraciones de Flory (mínimo 3 estados)
- Componentes listados en "Sistema visual base"
- Íconos de estado de tierra (seca / húmeda / empapada)
- Tokens: tipografía, color, espaciado, radios, sombras
- Estados de error y vacío de las pantallas principales

---

# Prioridad si el tiempo aprieta

1. **Home** con sus 3 estados
2. **Bottom sheets de feedback + confirmación del aprendizaje**
3. **Resultado del diagnóstico**
4. Onboarding
5. Reserva
6. Todo lo demás

Las dos primeras son la retención. La tercera es la magia. El resto es plomería.

---

# Fuera de alcance

Multi-planta ilimitada · gráficos e historial visual · comunidad o social · integración real del sensor · pantallas de suscripción · gamificación, rachas o logros · modo oscuro (deseable, no bloqueante) · idiomas adicionales.
