# Pixel Panchería — Tienda

Sitio público donde el cliente arma su pedido, paga y sigue el estado en vivo. Sitio **estático**
(HTML/CSS/JS vanilla, todo en un único `index.html`), servido en **Netlify**, con datos en
**Firebase / Firestore**. Estética pixel-art / retro.

Manual completo del proyecto (arquitectura, modelo de datos, mapas del código): [`../CLAUDE.md`](../CLAUDE.md).

---

## Registro de cambios

Bitácora con fecha y hora de qué se tocó en cada flujo de trabajo, para tener trazabilidad y
poder reutilizar la lógica en otros proyectos.

### 2026-08-04 01:55 (-03)

**Carrito: botón de pago siempre visible (sticky) + upsell inteligente "¿querés algo más?"**

Dos mejoras al carrito (`// ====== CART LOGIC ======`), ambas en `tienda/index.html`.

**1. Barra de checkout sticky.** El botón de pago vivía al final del formulario (nombre, tel,
dirección, mapa, pago, notas, cupón), así que había que scrollear todo para llegar. Ahora el
total + el botón quedan pegados abajo del carrito, siempre visibles.

- En `renderCart()`, el `#sendBtn` y un total compacto se envuelven en `<div class="cart-cta-bar">`
  con `position: sticky; bottom: 0`. La nota de privacidad quedó arriba, dentro del scroll
  (`.cart-privacy-note`).
- CSS `.cart-cta-bar`: full-bleed (márgenes negativos = padding del modal, 30px desktop / 20px
  mobile), fondo opaco `--bg-2`, borde superior verde y `box-shadow` con *spread* sólido que tapa
  el contenido que scrollea por detrás. En mobile suma `env(safe-area-inset-bottom)`.
- El total de la barra (`#ctaTotal`) lo actualiza `updateCartTotals()` con el `finalTotal` (mismo
  valor que el desglose); muestra `*` si el envío queda "a confirmar". El `#sendBtn` no se movió
  de lugar, así que los estados/textos por método de pago siguen intactos.
- El botón pasó a llamar `onCheckoutClick()` en vez de `sendOrder()` directo (para intercalar el
  upsell).

**2. Upsell "¿querés algo más?".** Al tocar pagar, si al pedido le falta algo que suele
acompañar, se ofrece **una sola vez por sesión** (flag `upsellShown`) antes de seguir.

- **Motor** `upsellSuggestions()`: mira las categorías presentes (`productCategory()`), tratando
  el **combo como pancho + bebida**. Reglas: si falta bebida → gaseosas (`b1`,`b2`); si hay
  pancho pero no papas → papas (`a1`,`a3`); si no hay pancho → pancho estrella (`p1`,`p2`).
  Máximo 3 sugerencias, filtrando agotados (`stockMap`). Si no hay nada útil que sugerir, saltea
  derecho al pago.
- **UI** `#upsellOverlay` (reusa `.product-overlay mini`), título "¿QUERÉS ALGO MÁS?", cards con
  **+ AGREGAR** y botón grande **"NO, ASÍ ESTÁ 👍"**.
- **Agregar**: productos simples (bebidas, papas fritas) se suman en el acto (`upsellAddSimple()`,
  clave de carrito "sin extras" = `id` + 9 `|`) y la card queda marcada "✓ AGREGADO"; productos
  con opciones (panchos, salchipapas) cierran el upsell y abren `openProduct()` para configurarlos.
- **Flujo**: `onCheckoutClick()` → si hay sugerencias y no se mostró aún, abre el upsell; si no,
  `sendOrder()`. "NO, ASÍ ESTÁ" (`upsellProceed()`) cierra y va al pago; la X / tocar afuera
  (`closeUpsell()`) solo cierra. No se re-renderiza el carrito mientras el form está lleno (para
  no perder los datos tipeados); `sendOrder()` lee el objeto `cart`, así que lo agregado entra igual.

Funciones nuevas expuestas a `window` (script `type="module"`): `onCheckoutClick`, `upsellAdd`,
`upsellProceed`, `closeUpsell`.

Verificado en navegador (mobile + desktop): barra pineada al fondo con el botón dentro del
viewport, upsell con las sugerencias correctas por escenario, add simple/pancho, "no gracias" →
pago, y que no reaparece en el 2° intento. Sin errores de consola.

### 2026-08-03 21:54 (-03)

**Pantalla de seguimiento: botón de contacto por WhatsApp**

En la pantalla de seguimiento de pedido que ve el cliente después de confirmar el carrito
(`...?pedido=<id>`, sección `// ====== SEGUIMIENTO DE PEDIDO EN VIVO`), se agregó un botón de
contacto directo al WhatsApp del local.

- **Botón** `.track-wa` con el texto **"💬 ¿ALGÚN PROBLEMA? CONTACTANOS"**, ubicado en el
  `innerHTML` de `renderTracking()`, justo antes del `.track-back` ("◀ VOLVER A LA TIENDA").
  Aparece en todos los estados del pedido (recibido, en preparación, en camino, entregado y
  cancelado).
- **Link**: `https://wa.me/5491178257432` con mensaje pre-cargado vía `?text=` que incluye el
  N° corto del pedido (`#` + últimos 5 chars de `order.id` en mayúsculas) para identificarlo al
  toque. Abre en pestaña nueva (`target="_blank" rel="noopener"`).
- **CSS** `.track-wa` (verde estilo WhatsApp, `--neon-green`) acorde a la estética retro/neón del
  resto de la pantalla, junto al bloque de `.track-back`.
- **Nota**: el link del footer (`desarrollado con <3 by GastrOS · contactate`,
  `wa.me/5491167920464`) es el contacto del desarrollador, **no** el del local — se dejó intacto.
