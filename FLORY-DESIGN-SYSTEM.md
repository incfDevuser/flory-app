# Flory — Design System

Documento único y autosuficiente. Todo el sistema con valores exactos: tokens, componentes,
kits de UI, voz, assets y reglas. No hace falta abrir ningún otro archivo para reconstruirlo.

- **Marca:** Flory — PlantTech. Sensor de suelo *Flory One* + app con IA.
- **Tagline:** «Tus plantas ya te hablan. Solo necesitaban una voz.»
- **Posicionamiento:** «Flory convierte los datos de tus plantas en consejos simples y llenos de cariño para que cuidarlas sea fácil y feliz.»
- **Idioma de producto:** español, tuteo. Mercado Chile (precios CLP).
- **Namespace del bundle:** `window.FloryDesignSystem_662926`
- **Entrada CSS:** `styles.css` (solo `@import`s)
- **Versión de este documento:** agosto 2026

---

## Índice

1. [Estructura de archivos](#1-estructura-de-archivos)
2. [Color](#2-color)
3. [Tipografía](#3-tipografía)
4. [Espaciado y layout](#4-espaciado-y-layout)
5. [Formas, bordes y sombras](#5-formas-bordes-y-sombras)
6. [Movimiento](#6-movimiento)
7. [Base CSS](#7-base-css)
8. [Componentes](#8-componentes)
9. [Kit — App móvil](#9-kit--app-móvil)
10. [Kit — App Pro](#10-kit--app-pro)
11. [Kit — Web](#11-kit--web)
12. [Voz y contenido](#12-voz-y-contenido)
13. [Iconografía](#13-iconografía)
14. [Assets](#14-assets)
15. [Cómo consumirlo](#15-cómo-consumirlo)
16. [Pendientes y avisos](#16-pendientes-y-avisos)

---

## 1. Estructura de archivos

```
styles.css                  entrada única de CSS (@imports)
thumbnail.html              tile del sistema
readme.md                   guía de marca (inglés)
ESPECIFICACION.md           especificación (español)
FLORY-DESIGN-SYSTEM.md      este documento
SKILL.md                    front matter para Agent Skills

tokens/
  fonts.css                 @import de webfonts + nota de sustitución
  colors.css                paleta, rampas, neutros, alias semánticos
  typography.css            familias, pesos, escalas
  spacing.css               escala 4px, gutters, contenedores
  radius-shadow.css         radios, bordes, sombras, gradientes, glass
  motion.css                duraciones, easings, press
  base.css                  body, h1–h5, links, selección, foco

components/
  core/        Button IconButton Icon Card Badge Tag
  forms/       Input Select Checkbox Radio Switch
  navigation/  Tabs BottomNav
  feedback/    Dialog Toast Tooltip
  plant/       MetricRing MetricBar PlantCard MascotTip

ui_kits/
  app/         6 pantallas base + AppShell
  app-pro/     8 pantallas Pro (la planta habla + diagnóstico por foto)
  web/         sitio de marketing completo

guidelines/    24 fichas de especímenes + mascota-descargas + logo-export
assets/        logo, mascota (8 PNG), fotos, 49 iconos Lucide
exports/       PNG listos: 8 pantallas Pro, 2 variantes de logo
```

Cada componente tiene tres hermanos: `<Name>.jsx`, `<Name>.d.ts` (contrato de props) y
`<Name>.prompt.md` (cuándo usarlo). Cada carpeta lleva además una ficha `@dsCard`.

---

## 2. Color

### 2.1 Paleta de marca (del manual, literal)

| Nombre del manual | Hex | Token |
| --- | --- | --- |
| Verde Principal | `#2DBA6E` | `--flory-green` |
| Verde Lima / Acento | `#A8E63A` | `--flory-lime` |
| Crema Fondo | `#FFF6E6` | `--flory-cream` |
| Verde Oscuro Texto | `#1C4B2E` | `--flory-forest` |
| Amarillo Aviso | `#FFD166` | `--flory-amber` |
| Morado Acento | `#7E57C2` | `--flory-violet` |

### 2.2 Rampas completas

**Verde**

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#EAF8F0` | `#D2F0E0` | `#A6E2C2` | `#6FD09E` | `#45C683` | `#2DBA6E` | `#22A05C` | `#1A7F49` | `#166238` | `#1C4B2E` |

**Lima** — `50 #F7FDEA` · `100 #EEFAD1` · `300 #CBEF8C` · `400 #A8E63A` · `500 #95D22B` · `600 #7CB021`

**Ámbar** — `50 #FFFAEC` · `100 #FFF1D0` · `300 #FFDF9C` · `400 #FFD166` · `600 #E0A32A` · `700 #A8761A`

**Morado** — `50 #F4F0FC` · `100 #E7DEF8` · `300 #B9A2E4` · `500 #7E57C2` · `600 #6B45AC` · `700 #553388`

**Rojo** (derivado, no está en el manual; solo destructivo) — `100 #FCE0DA` · `400 #F0765C` · `500 #DE5238` · `700 #A93520`

**Neutros cálidos**

| Token | Hex | | Token | Hex |
| --- | --- | --- | --- | --- |
| `--cream-0` | `#FFFFFF` | | `--ink-900` | `#1C4B2E` |
| `--cream-50` | `#FFFCF4` | | `--ink-700` | `#2F5F3F` |
| `--cream-100` | `#FFF6E6` | | `--ink-500` | `#5A7F67` |
| `--cream-200` | `#FBEDD6` | | `--ink-400` | `#87A594` |
| `--cream-300` | `#F2E2C6` | | `--ink-300` | `#AFC3B7` |
| `--cream-400` | `#E6DCC6` | | | |

> **Regla dura:** nunca gris puro ni negro puro. Todo neutro tiene verde dentro.
> **La crema es el fondo de página; el blanco es la tarjeta**, nunca al revés.

### 2.3 Alias semánticos — esto es lo que se usa en código

| Alias | Valor |
| --- | --- |
| `--bg-page` | `--cream-100` |
| `--bg-page-alt` | `--cream-50` |
| `--surface-card` | `--cream-0` |
| `--surface-sunken` | `--cream-200` |
| `--surface-brand` | `--green-500` |
| `--surface-brand-soft` | `--green-50` |
| `--surface-lime-soft` | `--lime-100` |
| `--surface-violet-soft` | `--violet-50` |
| `--surface-amber-soft` | `--amber-100` |
| `--surface-forest` | `--green-900` |
| `--text-heading` | `--green-900` |
| `--text-body` | `--ink-700` |
| `--text-muted` | `--ink-500` |
| `--text-faint` | `--ink-400` |
| `--text-on-brand` | `#FFFFFF` |
| `--text-on-forest` | `--cream-100` |
| `--text-link` / `--text-link-hover` | `--green-600` / `--green-800` |
| `--border-subtle` | `--cream-300` |
| `--border-default` | `--cream-400` |
| `--border-strong` | `--green-200` |
| `--border-focus` | `--green-500` |
| `--action-primary` / `-hover` / `-active` | `--green-500` / `--green-600` / `--green-700` |
| `--action-secondary` / `-hover` | `--lime-400` / `--lime-500` |
| `--action-disabled` | `--cream-300` |

### 2.4 Estado de la planta

| Estado | Token | Color | Fondo suave | Cuándo |
| --- | --- | --- | --- | --- |
| Sana | `--status-healthy` | `--green-500` | `--green-50` | «Feliz» |
| Atención | `--status-attention` | `--amber-400` | `--amber-100` | «Necesita agua», «Poca luz» |
| Crítico | `--status-critical` | `--red-500` | `--red-100` | Raro: sensor perdido, acción destructiva |
| Creciendo | `--status-growth` | `--lime-400` | `--lime-100` | «Creciendo» |

Verde = acción y salud. Ámbar = «necesita algo», y se avisa **mucho antes** de que sea urgente.
Morado = agua e IA. Rojo existe pero casi no se usa.

### 2.5 Colores de métrica

| Métrica | Token | Color | Suave |
| --- | --- | --- | --- |
| Agua | `--metric-water` | `--violet-500` | `--violet-50` |
| Luz | `--metric-light` | `--amber-400` | `--amber-50` |
| Nutrientes | `--metric-nutrients` | `--lime-500` | `--lime-100` |
| Temperatura | `--metric-temp` | `--green-400` | `--green-50` |

> El color viene **de la métrica, nunca del valor**. Un dato bajo se comunica con el
> `caption` en lenguaje natural y con el tono del `Badge`, no cambiando el color del anillo.

---

## 3. Tipografía

| Rol | Token | Familia | Peso |
| --- | --- | --- | --- |
| Display | `--font-display` | `"Baloo 2", "Poppins", system-ui, sans-serif` | 800 |
| Texto | `--font-body` | `"Nunito", "Poppins", system-ui, sans-serif` | 400 / 700 |
| Cifras | `--font-mono` | `"Nunito", ui-monospace, monospace` | 800 |

Pesos disponibles: `--fw-regular 400` · `--fw-medium 500` · `--fw-semibold 600` · `--fw-bold 700` · `--fw-extrabold 800`.

> **Sustitución pendiente.** El manual pide *Poppins Rounded ExtraBold* y *Nunito Rounded
> Regular*. No se entregaron binarios y el corte «Rounded» de Poppins no es distribuible.
> Se envían **Baloo 2** y **Nunito** desde Google Fonts, con Poppins como fallback
> geométrico documentado. Cambiar `tokens/fonts.css` cuando lleguen las licencias.

### Escala

| Token | Tamaño / interlínea | Uso |
| --- | --- | --- |
| `--text-display-lg` | 64 / 1.02 | héroe web |
| `--text-display` | 48 / 1.06 | titular de sección grande |
| `--text-h1` | 36 / 1.12 | |
| `--text-h2` | 28 / 1.18 | |
| `--text-h3` | 22 / 1.25 | nombre de planta |
| `--text-h4` | 18 / 1.30 | título de tarjeta |
| `--text-lg` | 18 / 1.6 | bajada |
| `--text-md` | 16 / 1.6 | cuerpo (default del body) |
| `--text-sm` | 14 / 1.55 | secundario |
| `--text-xs` | 12 / 1.45 | metadato |
| `--text-eyebrow` | 13, tracking `0.08em`, MAYÚSCULAS | única mayúscula del sistema |
| `--text-metric` | 40 / 1 | cifra de sensor |

Tracking: `--tracking-tight -0.015em` en titulares (el héroe web usa `-0.02em`),
`--tracking-normal 0` en cuerpo, `--tracking-wide 0.02em` en botones.

**Reglas de tipografía**

- Los titulares siempre display 800 con tracking negativo.
- El cuerpo **nunca** usa la display.
- La display **nunca** supera dos líneas.
- La unidad de una cifra va a ~50 % del tamaño del número.
- Sentence case en todo. La única mayúscula es el eyebrow.

---

## 4. Espaciado y layout

Escala base 4px: `--space-0 0` · `1 4` · `2 8` · `3 12` · `4 16` · `5 20` · `6 24` · `8 32` ·
`10 40` · `12 48` · `16 64` · `20 80` · `24 96` · `32 128`.

| Token | Valor | Uso |
| --- | --- | --- |
| `--gutter-mobile` | 20px | márgenes laterales de la app |
| `--gutter-desktop` | 32px | márgenes web |
| `--container-max` | 1200px | contenedor web |
| `--container-narrow` | 720px | texto largo |
| `--card-pad` / `--card-pad-lg` | 20 / 24px | relleno de tarjeta |
| `--section-y` / `--section-y-mobile` | 96 / 56px | ritmo vertical web |
| `--stack-tight` / `--stack` / `--stack-loose` | 8 / 16 / 24px | separación entre bloques |
| `--tap-min` | 48px | objetivo táctil mínimo |

**Elementos fijos:** tab bar de la app (abajo, glass); nav web (píldora flotante,
`top:16px`, sticky); FAB de la app (abajo-derecha, 16px de margen).

---

## 5. Formas, bordes y sombras

### Radios

`--radius-xs 8` · `sm 12` · `md 16` · `lg 22` · `xl 28` · `2xl 36` · `pill 999` · `circle 50%`

Alias: `--radius-card: 22px` · `--radius-button: pill` · `--radius-input: 16px` · `--radius-sheet: 28px 28px 0 0`

**Nada es recto.** Chips 8 · campos y tiles internos 12–16 · tarjetas 22 ·
hojas, modales y fotos 28–36 · botones, tags, badges y tabs píldora completa ·
iconos y avatares círculo.

### Bordes

`--border-width: 1.5px` (default del sistema) · `--border-width-strong: 2px` (anillo del radio, énfasis).
Atajo: `--border-card: 1.5px solid var(--border-subtle)`.

> No existe el patrón «tarjeta con borde izquierdo de color» en esta marca.

### Sombras — siempre teñidas de verde bosque, nunca negro

| Token | Valor | Uso |
| --- | --- | --- |
| `--shadow-xs` | `0 1px 2px rgba(28,75,46,.06)` | campos |
| `--shadow-sm` | `0 2px 6px rgba(28,75,46,.07)` | tarjetas |
| `--shadow-md` | `0 6px 18px rgba(28,75,46,.09)` | hover |
| `--shadow-lg` | `0 14px 34px rgba(28,75,46,.12)` | toasts, píldoras flotantes |
| `--shadow-xl` | `0 26px 60px rgba(28,75,46,.16)` | modales, foto de héroe |
| `--shadow-brand` | `0 8px 20px rgba(45,186,110,.28)` | solo bajo rellenos verdes |
| `--shadow-inset` | `inset 0 2px 4px rgba(28,75,46,.06)` | pista del Switch |
| `--ring-focus` | `0 0 0 3px rgba(45,186,110,.35)` | foco |

### Fondos especiales

| Token | Valor |
| --- | --- |
| `--gradient-brand` | `linear-gradient(135deg, #2DBA6E 0%, #A8E63A 100%)` |
| `--gradient-sun` | `linear-gradient(160deg, #FFF6E6 0%, #FBEDD6 100%)` |
| `--gradient-scrim` | `linear-gradient(180deg, rgba(28,75,46,0) 0%, rgba(28,75,46,.62) 100%)` |
| `--glass-cream` | `rgba(255,246,230,.72)` |
| `--blur-glass` | `saturate(140%) blur(14px)` |

- Fondo de página: crema plano. **Sin patrones, sin texturas, sin ruido.**
- El scrim es **obligatorio** bajo texto sobre fotografía; nunca una cápsula sólida.
- Transparencia y blur solo para chrome que flota sobre contenido (tab bar, nav web,
  scrim de modal al 42 % con blur 6px). Las tarjetas son opacas.

---

## 6. Movimiento

| Token | Valor | Uso |
| --- | --- | --- |
| `--dur-instant` | 90ms | |
| `--dur-fast` | 160ms | hover, color |
| `--dur-base` | 240ms | toggles, modales |
| `--dur-slow` | 400ms | anillos llenándose |
| `--dur-lazy` | 700ms | |
| `--ease-standard` | `cubic-bezier(.2,.8,.2,1)` | |
| `--ease-out-soft` | `cubic-bezier(.16,.84,.44,1)` | color, sombra |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | **el «pop» de Flory** |
| `--ease-in-out` | `cubic-bezier(.65,0,.35,1)` | flotaciones del héroe |
| `--press-scale` | `.96` | |
| `--hover-lift` | `translateY(-2px)` | |

Atajo compuesto:

```css
--transition-control: background-color var(--dur-fast) var(--ease-out-soft),
                      transform var(--dur-fast) var(--ease-spring),
                      box-shadow var(--dur-fast) var(--ease-out-soft);
```

**Estados**

- *Hover* — el relleno baja un paso en la rampa + lift 2px; las tarjetas pasan de
  `shadow-sm` a `shadow-md`; ghost y soft se llenan de `--green-50`; los links pasan a
  subrayado sólido. **Nunca hover solo por opacidad.**
- *Press* — `scale(.96)` con `--ease-spring`. Es la interacción más reconocible de la marca.
- *Focus* — `--ring-focus`, jamás el outline del navegador.

Sin parallax, sin fades largos, sin scroll con rebote.
Animaciones del héroe web: `flory-float` (5.5s, ±14px) y `flory-float-slow`
(7s, ±10px con rotación ±3°), ambas con `--ease-in-out` en bucle.

---

## 7. Base CSS

```css
:root{color-scheme:light}
body{background:var(--bg-page);color:var(--text-body);font-family:var(--font-body);
  font-size:var(--text-md);line-height:var(--lh-md);-webkit-font-smoothing:antialiased;
  text-wrap:pretty}
h1,h2,h3,h4,h5{font-family:var(--font-display);font-weight:var(--fw-extrabold);
  color:var(--text-heading);letter-spacing:var(--tracking-tight);margin:0;text-wrap:balance}
a{color:var(--text-link);
  text-decoration-color:color-mix(in oklab,var(--text-link) 35%,transparent);
  text-underline-offset:3px;transition:color var(--dur-fast) var(--ease-out-soft)}
a:hover{color:var(--text-link-hover);text-decoration-color:currentColor}
::selection{background:var(--lime-300);color:var(--green-900)}
:focus-visible{outline:none;box-shadow:var(--ring-focus);border-radius:var(--radius-sm)}
```

Orden de imports en `styles.css`: `fonts → colors → typography → spacing → radius-shadow → motion → base`.

---

## 8. Componentes

20 componentes. Todos son React puro: solo dependen de React y de las custom properties,
sin librerías externas.

### 8.1 `core/`

#### Button

Píldora, etiqueta en display 700, tracking `0.02em`, press con spring.

| Prop | Tipo | Notas |
| --- | --- | --- |
| `variant` | `primary \| secondary \| soft \| outline \| ghost \| danger` | `primary` verde + `--shadow-brand`; `secondary` lima |
| `size` | `sm \| md \| lg` | 36px/pad 16/font 14 · 46/22/16 · 54/28/18 |
| `fullWidth` | `boolean` | |
| `disabled` | `boolean` | aplana a crema sin sombra |
| `loading` | `boolean` | cambia el icono líder por spinner y bloquea |
| `leadingIcon` / `trailingIcon` | `ReactNode` | |

Un solo botón `primary` por pantalla.

#### IconButton

Círculo. `sm 34` · `md 44` · `lg 52`. Variantes `primary · soft · outline · ghost · glass`.
`label` **obligatorio** (nombre accesible). `glass` es para controles sobre fotografía.

#### Icon

Glifo de Lucide inyectado como SVG en línea; hereda `color` y `strokeWidth`.

| Prop | Tipo | Notas |
| --- | --- | --- |
| `name` | `string` | slug de Lucide: `droplet`, `sun`, `leaf`… |
| `size` | `number` | 18 en línea · 22 default · 24 en tab bar · 32 en tiles |
| `color` | `string` | mejor heredar |

Se apunta la página una vez a los iconos vendorizados:

```html
<script>window.FLORY_ICON_BASE = '../../assets/icons/';</script>
```

Sin eso cae al CDN fijado `lucide-static@0.441.0`.

#### Card

| Prop | Tipo | Notas |
| --- | --- | --- |
| `tone` | `plain \| soft \| cream \| lime \| violet \| forest` | `plain` blanco por defecto |
| `elevation` | `none \| sm \| md \| lg` | |
| `padding` | `number` | 20 default · 24 destacada · 16 lista densa |
| `radius` | `string` | la web usa `--radius-2xl` |
| `interactive` | `boolean` | lift + cursor |

Reglas: nunca anidar dos tarjetas con sombra; `forest` es la única superficie oscura y va
**una por pantalla**; los tonos teñidos significan algo, no decoran.

#### Badge

Píldora de estado — la reporta Flory, no es metadato genérico.
`tone`: `healthy · attention · critical · growth · info · neutral`. `size`: `sm` 22px / `md` 28px.
Punto de color líder (`dot`) salvo que se pase `icon`.

#### Tag

Píldora **elegida por el usuario**: filtros, rasgos, especies. `selected` la rellena de verde;
`onRemove` añade la `×`; acepta `icon`.

### 8.2 `forms/`

Todos los campos: **alto 50px, radio 16px, borde 1.5px, foco con halo verde**,
etiqueta en display 700 a 14px, hint/error a 13px.

| Componente | Props clave | Métricas |
| --- | --- | --- |
| `Input` | `label`, `hint`, `error`, `leadingIcon`, `trailingSlot` | 50px alto |
| `Select` | `label`, `hint`, `error`, `options` (strings o `{value,label}`), `placeholder` | chevron `▾` tipográfico a 16px del borde |
| `Checkbox` | `checked`, `onChange`, `label`, `description`, `disabled` | 24px, radio 8px, tick blanco dibujado con bordes |
| `Radio` | `checked`, `onChange`, `label`, `description`, `name`, `value` | 24px, borde 2px, punto interior 12px |
| `Switch` | `checked`, `onChange(next)`, `label`, `description`, `size`, `disabled` | `md` 54×32 (knob 26) · `sm` 44×26 (knob 20) |

`error` reemplaza a `hint`. Los switches guardan al instante: **no llevan botón «Guardar»**.

### 8.3 `navigation/`

**Tabs** — segmentado sobre pista hundida (`--surface-sunken`); pestaña activa = píldora
blanca con `--shadow-sm`; alto 38px; `fullWidth` reparte a partes iguales.
**Es el único estilo de tabs del sistema** — no hay tabs con subrayado en ningún sitio.

**BottomNav** — tab bar de la app: `--glass-cream` + `--blur-glass`, borde superior 1.5px,
padding `8px 10px 22px`, iconos 24px, etiqueta display 700 a 11px.
Activo `--green-600`, inactivo `--ink-400`. Máximo 5 ítems.
`items: [{value, label, icon}]`, `value`, `onChange`.

### 8.4 `feedback/`

**Dialog** — scrim verde bosque al 42 % con blur 6px; caja radio 28px, sombra `xl`,
entrada `flory-pop` (scale .94 → 1) con spring. `width` 420 default / 520 en formularios.
Se posiciona `absolute`, así que funciona dentro del marco del teléfono.

**Toast** — tarjeta blanca, disco de icono teñido 38px, sombra `lg`, entrada con spring
desde +10px. `tone`: `healthy · attention · critical · info`. Admite `action` y `onClose`.

**Tooltip** — etiqueta verde bosque, texto crema 12.5px, radio 12px, 4 posiciones
(`top · bottom · left · right`). Una frase corta; nada más largo.

### 8.5 `plant/` — los componentes propios de Flory

#### MetricRing — el objeto de dato insignia

Anillo SVG con `strokeLinecap:round`, pista en el color suave de la métrica,
transición de 400ms.

| Prop | Notas |
| --- | --- |
| `metric` | `water \| light \| nutrients \| temp` — elige color y etiqueta |
| `value` | el número del centro |
| `arc` | relleno 0–100 cuando el dato no es porcentaje (21 °C, horas de sol) |
| `unit` | va a ~50 % del tamaño del número |
| `size` | 120 en tarjeta · 168 en detalle · 70 en fila compacta |
| `thickness` | grosor del trazo |
| `label`, `caption` | |

Número en display 800 al 28 % del diámetro, unidad al 14 %.
**Nunca un número sin `caption` en lenguaje natural.**

#### MetricBar

Versión de fila: barra de 12px, banda de rango ideal (`idealRange: [min,max]`) en
`rgba(28,75,46,.07)`, icono + etiqueta a la izquierda, `readout` a la derecha.

#### PlantCard

La unidad de la pantalla «Hoy»: foto 76px (radio 16), nombre display 800 a 17,
`Badge` de estado, línea `especie · habitación`, hasta tres lecturas en línea
(`metrics: [{icon, value}]`).

#### MascotTip

Flory hablando: la recomendación de IA. `tone`: `cream · lime · green · violet`.
Mascota a la izquierda (`mascot`, `size`), título display 800, cuerpo 14.5/1.55,
`action` opcional. **Una por pantalla.**

---

## 9. Kit — App móvil

`ui_kits/app/` — marco 390×800, radio 44, doble anillo de bisel. Fondo crema,
tab bar glass, un solo botón verde primario por pantalla.

| Archivo | Contenido |
| --- | --- |
| `AppShell.jsx` | `PhoneFrame`, `StatusBar` (9:41 + señal/wifi/batería), `AppHeader` (subtítulo + título 26px + slot derecho + back opcional), `Scroll` |
| `HomeScreen.jsx` | Saludo con fecha, `MascotTip` de riego, dos tarjetas de ambiente (luz / temperatura), `Tabs` Todas/Atención, lista de `PlantCard`, tarjeta `forest` con el consejo de la semana |
| `PlantsScreen.jsx` | Alta de planta: emparejar sensor con diagrama visual, nombre / habitación / luz |
| `NotificationsScreen.jsx` | Avisos agrupados por momento, chips de acción |
| `ProfileScreen.jsx` | Estadísticas, upsell de Plus, ajustes con `Switch`, sensores con batería |
| `index.html` | Click-through real: abrir planta, `+` para dar de alta, «Ya la regué» dispara un `Toast`, tab bar funcional |

Cuatro pestañas: **Hoy · Mis plantas · Avisos · Perfil**.
Fondo blanco en todo el recorrido; las tarjetas de planta llevan mini-barras de indicador.

---

## 10. Kit — App Pro

`ui_kits/app-pro/` — lo que la versión Pro agrega sobre la app base. Ocho pantallas.

**Las dos funciones nuevas**

1. **La planta habla.** Cada lectura del sensor se traduce a una frase en primera persona.
   En «Hoy» aparece como burbuja con cola apuntando al retrato; el hilo completo es su
   propia pantalla.
2. **Diagnóstico por foto.** Cámara → análisis explicado → ficha del problema → plan de
   7 días con fechas y recordatorios → historial con antes y después.

| # | Pantalla | Qué resuelve |
| --- | --- | --- |
| 01 | Hoy · la planta habla | Retrato en blob, burbuja de voz, cuatro `MetricRing` de 70px, tarjeta morada «Flory notó un patrón» |
| 02 | Conversación | Hilo continuo con tres voces; indicadores del sensor incrustados en la burbuja |
| 03 | Cámara de diagnóstico | Encuadre con esquinas lima, modos Hoja / Plaga / Tierra / Flor, disparador de 76px |
| 04 | Análisis | Línea de escaneo, mascota pensando, hoja inferior con los cuatro pasos y 68 % |
| 05 | Diagnóstico | Foco marcado en la foto, certeza / gravedad / contagio, causa y tres acciones |
| 06 | Plan de 7 días | Anillo de progreso, tareas con fecha, `Switch` de recordatorio, foto de control el día 7 |
| 07 | Historial | Antes/después de tratamientos cerrados, lista de análisis con estado |
| 08 | Activar Pro | Domo verde, mascota, cuatro promesas, `$3.990` al mes con 14 días de prueba |

**Nav Pro** — cinco destinos con la cámara elevada al centro: Hoy · Habla · **cámara** · Avisos · Perfil.
El botón central es un círculo de 58px en `--surface-brand` con borde blanco de 3.5px,
`--shadow-brand` y margen superior negativo de 30px.

**Las tres voces del hilo**

| Voz | Fondo | Borde | Cola | Extra |
| --- | --- | --- | --- | --- |
| La planta | `--cream-0` | `--green-100` | abajo izquierda | puede traer `indicator` (barra del sensor incrustada) |
| Flory IA | `--surface-violet-soft` | `--violet-100` | abajo izquierda | etiqueta `FLORY IA` 11.5px tracking `.04em`; puede traer `result` (tarjeta de diagnóstico enlazada) |
| Tú | `--surface-brand` | — | abajo derecha | hora en blanco al 75 % |

Radio de burbuja: `20px 20px 20px 6px` (entrante) / `20px 20px 6px 20px` (saliente).

**Componentes propios del kit** (`ProFrames.jsx`): `ProPill` (píldora Pro con corona lima),
`ProNav`, `Screen` (maqueta + número + nota), `Status`, `ProHeader`, `ScrollCol`.

**Datos** en `data-pro.js`: conversación, pasos del análisis, diagnóstico completo
(cochinilla algodonosa, 94 % de certeza), plan, historial y beneficios Pro.

**Precio:** `$3.990`/mes con 14 días de prueba — el mismo valor que el plan Plus del sitio.

**Exports:** `exports/app-pro/*.png`, ocho PNG a 824×1644 (2x, marco de iPhone, fondo transparente).

---

## 11. Kit — Web

`ui_kits/web/` — rediseño en clave orgánica: **cero secciones rectangulares**.
Cada banda entra y sale con una curva.

| Bloque | Cómo está resuelto |
| --- | --- |
| `SiteNav` | Píldora flotante sticky (`top:16px`), glass crema, borde 1.5px, `--shadow-md`, alto 74px |
| `Hero` | Titular centrado 62px, banda de olas de elipses SVG (verde 500 + verde 600 al 22 % + lima al 16 % + sombra elíptica), producto flotando 470px, blobs de color y píldoras de dato con `fl-float` |
| `HowItWorks` | Tres burbujas de color (lima, ámbar, morado) con la mascota dentro y el número en un círculo blanco. Sin tarjetas |
| `WhatItMeasures` | Foto recortada en blob orgánico (`border-radius` de 8 valores), `Tabs` de métrica, `Card` radio 36 con `MetricBar`, `MascotTip` |
| `Pricing` | Tres planes en CLP — Flory One `$32.990`, Casa `$94.990`, Plus `$3.990/mes` — tarjetas radio 36 con un domo de color asomando detrás; ticks en discos verdes |
| `Faq` | Acordeones en forma de píldora que se abren a burbuja (radio píldora → 36px) |
| `CtaFooter` | Bloque verde bosque entre domo y ola, mascota centrada, dos botones; footer en crema con cuatro columnas |

Helpers exportados: `WaveTop({fill,height,flip,flipY})`, `DomeTop({fill,height})`,
`Blob({color,size,radius,opacity,style})`, `SectionHead({eyebrow,title,lead,align,onDark})`.

Ritmo: contenedor 1200px, gutters 32px, bandas alternas crema / blanco.
**Nunca dos bloques oscuros en una página.**

---

## 12. Voz y contenido

Los cuatro pilares del manual, literales:

| Pilar | Definición |
| --- | --- |
| **Amigable** | «Hablamos como amigos, siempre positivos» |
| **Simple** | «Explicamos lo importante de la forma más fácil» |
| **Cuidadosa** | «Nos importa el bienestar de tus plantas y el tuyo» |
| **Inteligente** | «Usamos datos y IA para darte consejos claros y útiles» |

**Persona.** Siempre **tú**, nunca *usted*. Flory habla como *nosotros* («te avisamos»,
«hemos mirado»); la mascota, a veces, como *yo*. En Pro, la planta habla en primera persona.
La planta es *tu potos*, *tu monstera* — posesivo, nunca «la unidad» ni «el dispositivo #4B2E».

**Forma de la frase.** Corta. Una idea por frase, una acción por pantalla.
Toda lectura va seguida de qué hacer:

- ✅ «La tierra está al 38 %. Con medio vaso de agua vuelve a su punto ideal.»
- ❌ «Humedad del sustrato: 38 % (rango óptimo 45–75 %).»

**Mayúsculas.** Sentence case en todo — titulares, botones, etiquetas, badges.
La única mayúscula es el eyebrow (`0.08em`). **Nunca ALL CAPS en una frase.**
Acentos y `¿ ¡` obligatorios.

**Botones en verbo.** «Regar ahora», «Ya la regué», «Registrar riego», «Ver mis plantas»,
«Consigue tu Flory», «Hablar con ella». Nunca «OK», «Enviar», «Aceptar».

**Los errores no culpan.** «Ese correo no nos suena, ¿lo revisas?».
«Tu potos tiene sed — lleva 3 días con la tierra seca.»
Flory avisa en ámbar mucho antes de que algo sea urgente.

**Números en formato español.** Coma decimal («4,5 h»), espacio antes de la unidad
(«38 %», «21 °C»), punto de miles («40.000 plantas»). Precios CLP con punto: `$32.990`.
Un número nunca aparece sin una frase en lenguaje llano al lado.

**El silencio es una función.** La app calla cuando todo va bien:
«Te escribimos solo cuando hace falta».

**Emoji.** Raro y cálido, como máximo uno en un saludo («Hola, Marta 🌿»).
Jamás como icono, ni en botones, etiquetas, badges o errores.

**Vocabulario.** planta · maceta · sustrato · riego · luz · nutrientes · consejo · avisos.
**Evitar:** dispositivo, unidad, telemetría, dashboard, monitorizar, optimizar.
Flory es una amiga con datos, no una plataforma de monitorización.

---

## 13. Iconografía

- **Set: Lucide**, fijado en `lucide-static@0.441.0`, cargado por el componente `Icon`
  de forma que los glifos heredan `currentColor`. **Es una sustitución** — el manual no
  define set propio. Se eligió por sus terminaciones redondeadas y trazo de 2px,
  coherentes con el wordmark y los contornos de la mascota.
- **Tamaños:** 18 en línea con texto · 22 default · 24 en tab bar · 20 en icon buttons `sm`.
- **Vocabulario base:** `droplet` agua · `sun` luz · `thermometer` temperatura ·
  `flask-conical` nutrientes · `sprout`/`leaf` planta · `sparkles` consejo IA · `bell` avisos ·
  `cpu` sensor · `battery-medium` · `wifi` · `bluetooth` · `house` · `chart-line` · `user` ·
  `plus` · `minus` · `check` · `chevron-left/right` · `settings` · `x` · `ellipsis` · `mail` ·
  `signal` · `arrow-right` · `play` · `life-buoy` · `shield` · `log-out`.
- **Añadidos para Pro:** `camera` · `message-circle` · `bug` · `scissors` · `crown` ·
  `image` · `images` · `scan-line` · `zap` · `refresh-cw` · `circle-check` · `triangle-alert` ·
  `wind` · `spray-can` · `lock` · `arrow-up-right` · `wand-sparkles` · `heart` · `clock`.
- **Nunca** dibujar iconos SVG a mano, usar emoji como icono ni glifos unicode como icono.
  Los dos glifos no-Lucide del sistema son el `▾` del `Select` y la `×` de `Tag`/`Toast`,
  ambos intencionalmente tipográficos.
- **La mascota no es un icono.** Es ilustración: PNG raster, mínimo 60px de alto,
  nunca enmascarada, teñida ni recortada en círculo.

---

## 14. Assets

| Ruta | Qué es |
| --- | --- |
| `assets/logo-flory.png` | Wordmark en Verde Principal, fondo transparente (458×322) |
| `assets/logo-flory-white.png` | Blanco calado, con el brote de la «o» perforado — para verde y fotografía |
| `assets/brand-sheet.png` | El manual original, referencia |
| `assets/mascot/flory-hero.png` | Pose principal |
| `assets/mascot/flory-wave.png` | Saludando — bienvenida, éxito |
| `assets/mascot/flory-watering.png` | Regando — consejo de riego |
| `assets/mascot/flory-thinking.png` | Pensando — análisis, IA trabajando |
| `assets/mascot/flory-idea.png` | Idea — consejo, tip |
| `assets/mascot/flory-heart.png` | Corazón — prueba social, cariño |
| `assets/mascot/flory-care.png` | Cuidando |
| `assets/mascot/leaf-purple.png` | Hoja morada, marca suelta |
| `assets/photos/flory-device.png` | Producto recortado sobre transparencia, para el héroe |
| `assets/photos/sensor-in-pot-wide.png` | Sensor en maceta, plano abierto |
| `assets/photos/sensor-in-pot-closeup.png` | Sensor en maceta, detalle |
| `assets/icons/*.svg` | 49 glifos de Lucide vendorizados |
| `exports/app-pro/*.png` | Las 8 pantallas Pro a 824×1644 |
| `exports/logo/*.png` | Logo en las dos variantes, 2400×1350 |

**Logo.** Es un wordmark raster extraído del manual; **no hay original vectorial en las
fuentes — pedir el SVG al equipo de marca.** Sobre verde o fotografía se usa
`logo-flory-white.png`. **Nunca** construir el lockup blanco con
`filter:brightness(0) invert(1)`: eso rellena el brote dentro de la «o» y destruye la marca.

**Fotografía.** Luz de día cálida, terracota real, tierra real, profundidad de campo corta,
interior doméstico desenfocado. Nunca fondo de estudio blanco, nunca frío o desaturado,
nunca blanco y negro.

**Ilustración.** La mascota es el único sistema ilustrativo: un brote verde amigable con las
puntas de las hojas moradas. Aparece en consejo, bienvenida, éxito o estado vacío.
Una por pantalla, nunca dos. No redibujarla, no teñirla, no recortarla en círculo.
Descargas en `guidelines/mascota-descargas.html`.

---

## 15. Cómo consumirlo

### En una página estática

```html
<link rel="stylesheet" href="styles.css">
<script>window.FLORY_ICON_BASE = 'assets/icons/';</script>
<script src="_ds_bundle.js"></script>
<script type="text/babel">
  const { Button, Card, MetricRing, MascotTip } = window.FloryDesignSystem_662926;
</script>
```

### En React de producción

1. Copia `tokens/` y `styles.css`, e impórtalo una vez en la raíz (`import './styles.css'`).
2. Copia `components/**/*.jsx` tal cual — solo dependen de React y de las custom properties.
3. Copia `assets/` y ajusta las rutas de mascota/iconos, o define `window.FLORY_ICON_BASE`.
4. Los `.d.ts` hermanos ya dan el contrato de props si usas TypeScript.

### Checklist de revisión

- [ ] ¿Hay algún gris o negro puro? → cámbialo por un `--ink-*` o `--cream-*`.
- [ ] ¿Alguna esquina recta? → aplica un radio del sistema.
- [ ] ¿Una sombra neutra? → usa las teñidas de verde bosque.
- [ ] ¿Un número sin frase que lo explique? → añade `caption`.
- [ ] ¿Más de un botón primario o más de una mascota en la pantalla? → quita uno.
- [ ] ¿Dos superficies `forest` en la misma vista? → deja una.
- [ ] ¿Hover solo por opacidad? → cambia relleno + lift.
- [ ] ¿Texto sobre foto sin scrim? → añade `--gradient-scrim`.
- [ ] ¿Un botón que no empieza por verbo? → reescríbelo.

---

## 16. Pendientes y avisos

1. **Fuentes sustituidas.** Faltan los binarios de *Poppins Rounded ExtraBold* y
   *Nunito Rounded Regular*. Hoy: Baloo 2 + Nunito desde Google Fonts.
   Cambio de un solo archivo (`tokens/fonts.css`) cuando lleguen las licencias.
2. **Logo y mascota son raster**, recortados del manual y calados a mano. El logo original
   es de 458×322 px, así que cualquier ampliación pierde nitidez. Con los SVG originales
   todo gana definición.
3. **Iconografía sustituida** (Lucide) porque el manual no define set propio.
4. **No existía UI de origen** (ni código ni Figma), así que los tres kits son
   composiciones a partir de las reglas de marca, no recreaciones de pantallas reales.
5. **Las fotos de diagnóstico de Pro** reutilizan las del sensor: la «hoja con plaga» no se
   ve realmente enferma. Con 2-3 fotos reales de plaga u hoja seca la pantalla 05 queda
   creíble.
6. **Superficies aún no cubiertas:** Flory Hub, onboarding de cuenta, estados vacíos y de
   error, modo oscuro, tablet.
