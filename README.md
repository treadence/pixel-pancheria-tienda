# Pixel Panchería — Tienda

Sitio público donde el cliente arma su pedido, paga y sigue el estado en vivo. Sitio **estático**
(HTML/CSS/JS vanilla, todo en un único `index.html`), servido en **Netlify**, con datos en
**Firebase / Firestore**. Estética pixel-art / retro.

Manual completo del proyecto (arquitectura, modelo de datos, mapas del código): [`../CLAUDE.md`](../CLAUDE.md).

---

## Registro de cambios

Bitácora con fecha y hora de qué se tocó en cada flujo de trabajo, para tener trazabilidad y
poder reutilizar la lógica en otros proyectos.

### 2026-08-13 21:39 (-03)

**Carrito: opción "Retiro en el local" (envío $0 + sin sistema de coins)**

Antes el checkout era solo delivery: obligaba a cargar dirección + ubicación en el mapa y calculaba
el envío por zonas. Se agregó un **toggle de modo de entrega** arriba del bloque de dirección con dos
botones: **🛵 Envío a domicilio** (default, flujo de siempre) y **🏪 Retiro en el local**. En modo
retiro: **envío $0**, no se pide dirección y se **ignora el sistema de coins** (no suma coins ni permite
canjear recompensas).

Cambios en `tienda/index.html`:

- **HTML del carrito**: nuevo `.delivery-mode` (`#dmDelivery` / `#dmPickup`). Los tres campos de
  dirección (DIRECCIÓN + PISO/DEPTO + REFERENCIAS) se envolvieron en `#deliveryFields` para poder
  ocultarlos. Nuevo bloque `#pickupInfo` (`.pickup-info`) con la dirección del local
  (**Calle 410 N°747 · Juan María Gutiérrez**), visible solo en modo retiro. CSS nuevo:
  `.delivery-mode`, `.dm-btn`(`.sel`), `.pickup-info`/`.pickup-title`/`.pickup-addr`/`.pickup-note`.
- **Estado + toggle**: `window.deliveryMode` (`'delivery'`/`'pickup'`) + `window.setDeliveryMode(mode)`
  que alterna clases `.sel`, muestra/oculta `#deliveryFields`/`#pickupInfo`, suelta cualquier
  recompensa elegida y recalcula. Como `renderCart()` reconstruye el form entero en cada render, al
  final de `renderCart()` se **re-aplica** el modo persistido (`setDeliveryMode(window.deliveryMode)`)
  en vez del `updateCartTotals()` suelto.
- **`updateCartTotals()`**: `isPickup` → rama de envío nueva (`shippingCost=0`, label "RETIRO EN LOCAL",
  verde); `rewardDesc` forzado a 0; línea "🪙 sumás X coins" y la caja de canje `#vidaExtraBox`
  ocultadas.
- **`sendOrder()`**: `isPickup` saltea la validación de dirección/ubicación (`loc` queda `null`); rama
  de zona nueva (`deliveryCode:'retiro-local'`, `deliveryLabel:'Retiro en el local'`, envío $0);
  `latitude/longitude/distanceKm` a `null` y `address/addressUnit/addressRef` vacíos; el pedido se
  marca con **`pickup:true`** y **`noCoins:true`**.

Cambio en `admin/index.html`:

- **`awardLoyaltyForOrder()`**: al entregar, si el pedido trae `noCoins` o `pickup` la transacción
  **retorna sin acreditar coins** (`if (o.noCoins || o.pickup) return null;`). Así el retiro en el
  local también ignora los coins del lado del panel.

Sin colección nueva ni cambios en `firestore.rules`. Umbrales/dirección del local siguen hardcodeados.

### 2026-08-08 20:57 (-03)

**Envío fuera de zona: ahora cuesta $4.000 fijo + aviso claro en el seguimiento**

Antes, una dirección a **más de 6 km** (`loc.distanceKm > MAX_RADIUS_KM`) quedaba como
"delivery a confirmar" con **envío $0**: el cliente pagaba (incluso por MP) solo los productos y
el costo del envío se resolvía después por WhatsApp. Ahora esas direcciones tienen un **envío fijo
de $4.000 ya incluido en el total**, y la entrega sigue sin estar garantizada (flag
`needsShippingConfirmation`).

Cambios en `tienda/index.html` (la lógica de zonas vive repetida en 3 lugares, todos actualizados):

- **`updateZoneStatus()`** (cartel del selector de dirección): el estado "outside" pasó de
  "FUERA DE COBERTURA / te confirmaremos por WhatsApp" a **"FUERA DE ZONA HABITUAL · Envío $4.000"**
  + nota "Intentaremos enviártelo igual. Si no llegamos, te avisamos y te reintegramos lo abonado".
- **`updateCartTotals()`** (desglose en vivo del carrito): rama `> MAX_RADIUS_KM` ahora
  `shippingCost = 4000`, `shippingLabel = '+$4.000'`, color naranja. Como el envío ya va incluido,
  el total dejó de mostrarse como **"TOTAL (sin envío)"** amarillo → ahora es un **TOTAL** verde normal
  y se quitó el `*` del total en la barra sticky (`#ctaTotal`). La nota bajo el total pasó a explicar
  el fuera-de-zona (envío incluido + reintegro si no se puede entregar).
- **`sendOrder()`** (cálculo real que se guarda en Firestore): rama fuera de zona `shippingCost = 4000`,
  `deliveryLabel = 'Delivery fuera de zona ($4.000)'`, `needsShippingConfirmation = true`. El `confirm()`
  previo al envío se reescribió: informa el costo de $4.000 ya incluido y el reintegro si no llegan a
  cubrir la zona.
- **Página de seguimiento** (`renderTracking()`, `...?pedido=<id>`): aviso nuevo `.track-outside`
  (borde punteado naranja) que aparece **solo si `order.needsShippingConfirmation`** y el pedido sigue
  vivo (no `delivered`/`cancelled`). Texto: la dirección quedó fuera del radio habitual, quedate tranqui,
  intentaremos llevártelo igual; si por distancia no podemos, te contactamos a la brevedad por WhatsApp y
  te reintegramos lo abonado. El texto del reintegro se adapta según `order.paid` (si ya pagó, "te
  reintegramos el total abonado"; si no, "y si ya lo habías pagado, te reintegramos el importe completo").
  CSS `.track-outside` / `.to-title` acorde a la estética retro.

Sin cambios de modelo de datos ni de `firestore.rules` (`needsShippingConfirmation` y `shippingCost` ya
existían en el pedido). Los umbrales (`FREE_RADIUS_KM = 1`, `MAX_RADIUS_KM = 6`) y los montos ($4.000)
siguen **hardcodeados** en el código, no configurables desde el admin.

**Nota pendiente (no resuelto acá):** ahora que fuera de zona cobra $4.000 por MP, el pago online incluye
el envío, pero si al revisar no pueden entregar hay que hacer la **devolución manual por MP**. El aviso ya
se lo anticipa al cliente.

### 2026-08-04 03:15 (-03)

**Fix: pago de MP abandonado aparecía como "pedido en curso"**

Síntoma: un cliente sin pedido activo entraba a la tienda y veía el chip "📍 Tu pedido en curso →"
(y al abrirlo, la pantalla de "el pago no se completó" / "confirmando tu pago").

Cómo reconoce la tienda un pedido en curso: **por dispositivo/navegador**, vía
`localStorage['pixel_pedido_activo']` (`{id, at}`). NO hay consulta por teléfono/cuenta — `activeOrderChip()`
lee ese id y hace `getDoc` de ese pedido puntual. O sea el reconocimiento es del navegador, no de la cuenta.

Causa: al elegir Mercado Pago, `payWithMercadoPago()` guarda el pedido con `status: 'pending_payment'`
y escribe `pixel_pedido_activo` **antes** de redirigir a MP. Si el pago no se completa (abandonado o
rechazado), el pedido queda en `pending_payment` para siempre, y `activeOrderChip()` mostraba el chip
para cualquier pedido que no fuera `cancelled`/`delivered` y tuviera <3h → un pago fallido se veía como
pedido en curso.

Fix: en `activeOrderChip()`, branch nuevo para `st === 'pending_payment'` → **no** muestra el chip (si
el pago entra, el webhook lo pasa a `received` y ahí sí aparece); y si pasaron +30min lo da por
abandonado y borra `pixel_pedido_activo`. No afecta pedidos reales (`received`/`preparing`/`ontheway`
siguen mostrando el chip). Nota/pendiente opcional: si se abre directo la trackUrl de un
`pending_payment` viejo (no rechazado), la pantalla sigue diciendo "CONFIRMANDO TU PAGO" — no se tocó.

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
- **Ajuste (mismo día):** el padding **inferior** del `.cart-modal` se movió adentro de la barra
  (`.cart-modal` pasó a `padding: 30px 30px 0` en desktop y `padding-bottom: 0` en mobile; ese
  espacio ahora es el `padding-bottom` de `.cart-cta-bar`). Sin esto, la barra quedaba a `bottom:0`
  del área de contenido y por debajo asomaba el carrito en la franja del padding del modal. Ahora
  la barra tapa hasta el borde de abajo (queda solo el marco de 4px del modal en desktop).
- **Ajustes de UI del upsell (mismo día):**
  - `.upsell-title` tiene `padding: 0 44px` para que el texto no choque con la X de cerrar.
  - El botón para seguir al pago pasó de "NO, ASÍ ESTÁ 👍" a **"FINALIZAR PEDIDO"** (sin emoji).
  - Al elegir un **pancho** desde el upsell, ya **no** abre el modal de producto completo: muestra
    un sub-paso propio (`renderUpsellSausage()`) con el pancho (sprite + nombre + descripción,
    "para que se vea qué trae" como los combos) y **solo** un `<select>` de tipo de salchicha
    (Alemana/Viena). "🌭 AGREGAR AL PEDIDO" (`upsellConfirmPancho()`) lo suma con esa salchicha y
    vuelve a la lista; "◀ VOLVER A LAS SUGERENCIAS" (`upsellBackToList()`) regresa sin agregar.
    El alta usa `upsellAddToCart(item, sausages)` que arma la **misma clave** que
    `confirmAddToCart` (incluye `sausagesKey`), así se agrupa/fusiona igual que el flujo normal.
    Estado nuevo: `_upsellSuggestions` (para re-render) y `_upsellAdded` (Set de ids ya agregados,
    para marcar las cards "✓ AGREGADO"). Funciones nuevas en `window`: `upsellConfirmPancho`,
    `upsellBackToList`.
  - **Fix de tamaños:** el label `▶ TIPO DE SALCHICHA` (`.upsell-sausage-field label`) se veía
    grande/apretado (10px sin `line-height`, mientras el resto de la app usa 9px en mobile). Se
    igualó a `.pm-section-title` (cian, `line-height: 1.6`, 10px desktop / 9px mobile) y el
    `.upsell-title` baja a 13px en mobile. El bloque `.upsell-sausage-field` pasó a `margin: 18px 0`
    (antes solo abajo) para que el aire arriba/abajo del selector sea simétrico.
  - **Fix del carrito desactualizado:** al agregar algo desde el popup y cerrar/`FINALIZAR PEDIDO`,
    el carrito de atrás seguía mostrando el estado viejo (lista + total) ~2s hasta redirigir a MP
    (el pago sí tomaba el total correcto porque `sendOrder` lee el objeto `cart`). Se agregó
    `refreshCartKeepingForm()`: hace snapshot de los inputs del formulario (`fName`, `fPhone`,
    `fAddress`, `fAddressUnit`, `fAddressRef`, `fNotes`, `fPay`, `fCoupon`), llama `renderCart()` y
    restaura esos valores + `updateCartTotals()`. Se llama desde `upsellProceed()` y `closeUpsell()`,
    así el carrito refleja lo agregado sin perder lo que el cliente ya tipeó. (La dirección/mapa y
    el cupón viven en estado del módulo, no en el DOM, así que sobreviven al re-render.)
  - **Fix del chip "pedido en curso" tapado en mobile:** el chip `.track-chip` ("📍 Tu pedido en
    curso →", lo crea `activeOrderChip()` para volver al seguimiento si el cliente cerró/volvió
    atrás) quedaba **tapado detrás del `.cart-fab`** en mobile, porque ahí el FAB del carrito ocupa
    todo el ancho (`left:16px; right:16px`, z-index 200) a la misma altura (`bottom` ~20px, z-index
    150). Se agregó una media query (`max-width: 600px`) **después de la regla base** (para ganar por
    orden de fuente) que sube el chip por encima del FAB: `bottom: calc(84px + safe-area)`,
    full-width y `z-index: 210`. En desktop no cambia (chip a la izquierda, carrito a la derecha).
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
