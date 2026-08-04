# Pixel Panchería — Tienda

Sitio público donde el cliente arma su pedido, paga y sigue el estado en vivo. Sitio **estático**
(HTML/CSS/JS vanilla, todo en un único `index.html`), servido en **Netlify**, con datos en
**Firebase / Firestore**. Estética pixel-art / retro.

Manual completo del proyecto (arquitectura, modelo de datos, mapas del código): [`../CLAUDE.md`](../CLAUDE.md).

---

## Registro de cambios

Bitácora con fecha y hora de qué se tocó en cada flujo de trabajo, para tener trazabilidad y
poder reutilizar la lógica en otros proyectos.

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
