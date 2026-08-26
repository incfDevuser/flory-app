# Flory — Manual para el equipo móvil

Este documento no explica cómo programar la app. Explica **qué estás construyendo y por qué**, para que cuando tengas que tomar una decisión que el spec no cubre —y van a ser muchas— tengas con qué decidir.

Léelo antes de escribir la primera pantalla.

---

## 1. Qué es Flory

Flory es una app que convierte una planta real en algo que te dice qué necesita.

Eventualmente habrá un sensor físico que se instala en la maceta y mide humedad, temperatura y luz. **Ese sensor todavía no existe.** Lo que estás construyendo funciona sin él: calcula cuándo regar a partir de la especie, el entorno y lo que el usuario va reportando, y diagnostica problemas con IA a partir de una foto.

En una frase: **"Tu planta te habla."**

---

## 2. El problema real

Mucha gente quiere tener plantas. Pocas saben cuidarlas.

No es falta de información: hay miles de artículos sobre cómo regar un potus. El problema es que la información es genérica y el momento es específico. _"Riega cuando la tierra esté seca"_ no le sirve a alguien que no sabe qué significa "seca", ni qué tan profundo revisar.

El resultado es un patrón conocido: se compra la planta con entusiasmo, se riega de más las primeras semanas, se muere en tres meses, y la persona concluye que "no tiene mano para las plantas".

**La causa de muerte más común en plantas de interior es exceso de riego, no falta.** Nadie falla por no querer. Falla por no tener retroalimentación.

---

## 3. Quién la usa

**Camila, 29, departamento en Ñuñoa.** Tiene entre 2 y 8 plantas de interior. Le importan — les puso nombre, las eligió, publica fotos de ellas. Ya mató al menos una y le dolió.

Esa última parte es la clave: **lo que abre la billetera es el dolor emocional, no la conveniencia.** Camila no busca optimizar su rutina de riego. Busca dejar de sentirse culpable.

### Quién NO es el usuario

Importa tanto como lo anterior, porque define qué no construimos:

- **El experto en plantas.** Tiene 40 macetas, lee la tierra con el dedo y no necesita que le expliquen nada. Nos va a criticar la precisión y no va a pagar.
- **El agricultor.** Es otro producto, otro precio, otro canal.
- **El que quiere una planta decorativa.** Si no le importa si vive o muere, no hay dolor que resolver.

---

## 4. La identidad: Flory habla, la app no

Esto es lo más importante del documento.

Todo texto dirigido al usuario está **en primera persona de la planta**. No es un detalle de copy: es el producto. Los datos los mide cualquier sensor de USD 15. Lo que hace que alguien pague una suscripción es el vínculo con _su_ planta.

| App normal                   | Flory                                         |
| ---------------------------- | --------------------------------------------- |
| "Recordatorio de riego"      | _"Tengo sed, ¿me riegas?"_                    |
| "Humedad óptima"             | _"Estoy perfecta, no necesito nada"_          |
| "Error al procesar imagen"   | _"No pude verme bien, ¿repites la foto?"_     |
| "Se detectó exceso de riego" | _"Creo que tomé más agua de la necesaria 😅"_ |

### Reglas de la voz

**Nunca regaña.** El usuario ya llega con culpa de una planta muerta. _"Tengo mucha sed"_ funciona. _"¡Llevas 5 días sin regarme!"_ hace que desinstale.

**Nunca lo hace sentir tonto.** Si la foto está mala, es Flory la que no alcanza a ver, no el usuario el que la sacó mal.

**Nunca finge certeza.** Cuando el diagnóstico es dudoso, lo dice: _"Creo que es esto, pero podría ser otra cosa"_. Es mejor producto que sonar sabelotodo y equivocarse.

**Rota las frases.** Hay ~6 variantes por estado. Si Flory repite el mismo texto todos los días, deja de sentirse viva.

### La única excepción

Las pantallas transaccionales —pago, cuenta, datos de envío— hablan en tono neutro. Cuando alguien va a poner su tarjeta necesita sentir que trata con una empresa, no con un potus.

---

## 5. Los principios de diseño

**Una acción principal por pantalla.** Si hay dos botones del mismo peso, algo está mal.

**La ficha de la planta es la app.** El 90% del uso ocurre ahí. Todo lo demás son desvíos que vuelven a ella.

**Nada de números crudos.** No mostramos porcentajes, lux ni gráficos. Si aparece un número es un conteo de días. Los números son exactamente lo que hace a este producto igual a cualquier sensor barato.

**El estado se lee en 2 segundos.** Desde la pantalla bloqueada hasta abrir la app, el usuario debe saber si su planta está bien sin leer una frase completa. El color y la ilustración cargan ese peso.

**Nada de rojo.** El estado urgente va en coral o naranja. El rojo dispara culpa.

---

## 6. Los tres estados

Todo el producto gira en torno a esto:

| Estado       | Cuándo                                | Sensación         |
| ------------ | ------------------------------------- | ----------------- |
| **Bien**     | Falta más de un día para regar        | Calma, verde      |
| **Atención** | Toca hoy o mañana, o diagnóstico leve | Ámbar suave       |
| **Urgente**  | Atrasado 3+ días, o diagnóstico grave | Coral. Nunca rojo |

---

## 7. Cómo funciona por dentro (lo que necesitas saber)

### El motor de riego NO usa IA

Es aritmética en la base de datos. Intervalo base de la especie × factores de entorno (interior/exterior, luz, tamaño y material de maceta, estación). Sale un número de días.

Está en Postgres a propósito: es determinista y hay una sola fuente de verdad. **No lo dupliques en el cliente.**

### La voz de Flory tampoco usa IA

Son plantillas con variables. Costo cero.

### Solo la identificación y el diagnóstico por foto llaman a un modelo

Cada tarea usa su propia Edge Function, nunca llama al modelo desde la app. La app prepara
la foto e invoca la función autenticada; las imágenes se guardan en Storage privado.

> **Regla dura:** las llaves de OpenAI y el `service_role` de Supabase **nunca** tocan el cliente. Un `.env` de React Native se extrae del bundle en minutos. En la app solo vive la `anon key`, que es pública por diseño y está protegida por RLS.

---

## 8. El loop que sostiene el producto

Esto es lo que tienes que entender mejor que nada:

```
Flory avisa → el usuario riega → Flory pregunta cómo estaba la tierra
   → el intervalo se ajusta ±20% → Flory lo dice en voz alta
```

Cada vuelta, Flory se vuelve más precisa con **esa** casa, **esa** maceta, **esa** ventana. Después de tres meses conoce el ritmo real de la planta de Camila, no el promedio de internet.

**Ese es el activo del negocio.** Es lo que no se copia y lo que Camila pierde si cancela.

### La pantalla más importante de la app

Cuando el feedback cambia el intervalo, Flory tiene que **decirlo explícitamente**:

> _"Anotado. Parece que todavía tenía agua, así que la próxima vez voy a esperar un poco más."_
> **Próxima agua en 14 días**

Si ese ajuste ocurre en silencio, se pierde el único momento en que el producto demuestra que aprende. No la trates como una pantalla de confirmación más.

---

## 9. Las tres cosas que pueden matar el producto

**1. El push del primer ciclo.** Alrededor del día 8, Flory manda su primer aviso. Si el usuario lo ignora, no vuelve, y no hay nada más que la app pueda hacer. Es el momento más crítico de todo el producto.

Por eso el push se prueba en un teléfono físico en la semana 2, antes de que la ficha esté bonita. Certificados, tokens que caducan, comportamiento distinto en simulador — si eso no funciona, nada más importa.

**2. El diagnóstico vago.** Si la primera respuesta es _"podría ser riego o luz"_, el usuario no vuelve a usarlo. Cada diagnóstico debe dar causa, acción concreta y plazo. Incluyendo lo que **no** se recupera: _"las hojas amarillas no se van a poner verdes otra vez, pero las nuevas deberían salir sanas"_.

**3. Construir de más.** Cuando lleguen los primeros usuarios van a pedir cosas. Bugs se arreglan; features no se agregan durante los 60 días de medición. Si cambias el producto mientras corre el experimento, no vas a saber qué causó qué.

---

## 10. Casos borde que no puedes ignorar

**La planta artificial.** Si alguien fotografía una planta de plástico y la app la acepta, empieza a mandar recordatorios de riego para algo que no existe. La misma rama cubre: flores cortadas en jarrón, planta muerta, foto de una pared, varias plantas en una maceta, foto ilegible. Cada una tiene su respuesta en voz de Flory y ninguna crea una planta.

**La especie que no está en el catálogo.** Hay 206 especies cargadas. Cuando aparece una nueva, el sistema crea una ficha provisional a partir de un arquetipo de cuidado. **La app debe mostrar que esos valores son aproximados** — un aviso discreto, no letra chica.

**Las mascotas.** Hay 44 especies donde ASPCA simplemente no las ha evaluado. La app **no puede mostrarlas como "no tóxicas"**. Tiene que decir "no hay datos". Decirle a alguien que su gato puede masticar una planta sin riesgo, cuando nadie lo verificó, es el tipo de error que no se arregla con una disculpa.

---

## 11. Qué se mide

La app tiene que instrumentar esto desde el día uno, no después:

- Retención D1, D7, **D30**
- % que responde el feedback de tierra
- % que usa el diagnóstico por foto
- Funnel de la reserva del sensor
- Notificaciones enviadas → abiertas → que terminaron en riego

### El veredicto a los 60 días

| Métrica             | 🟢     | 🔴     |
| ------------------- | ------ | ------ |
| Retención D30       | > 25 % | < 10 % |
| Feedback respondido | > 40 % | < 15 % |
| Reservas / usuarios | > 5 %  | < 2 %  |

Rojo en retención significa que el problema no dolía lo suficiente, y el sensor no lo arreglaría. **La app que estás construyendo es el experimento que responde eso.**

---

## 12. Lo que NO va en esta versión

Multi-planta ilimitada · gráficos e historial visual · comunidad o social · integración real del sensor · suscripciones de pago · gamificación, rachas o logros.

Si algo de esto se cuela, no es que sobre trabajo: es que contamina la medición.

---

## En una línea

**Flory existe para que alguien deje de sentirse culpable con sus plantas.** Cada decisión de la app —una palabra, un color, un timing de notificación— se juzga contra eso.
