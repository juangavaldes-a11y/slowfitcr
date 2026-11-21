# Plan de migración a Nidux (ecommerce + POS)

Fecha: 2026-11-20. Tienda: https://slow.minidux.com · Admin: https://admin.nidux.net · POS: https://pos.nidux.net

## 1. Estado actual

- Tienda Nidux con 51 productos (variantes color/talla, stock, precios, tags, fotos con el mosaico del catálogo primero), categorías, páginas legales (términos, privacidad, eliminación de datos, envíos, cambios y devoluciones) en español e inglés.
- El proyecto `slowfit-site` redirige sus páginas públicas a `slow.minidux.com` (`nidux-redirects.ts`, redirección temporal 307). `/admin`, el POS interno y `/api` no se redirigen.
  - `DISABLE_NIDUX_REDIRECT=1` la apaga (usado en e2e).
  - `NIDUX_REDIRECT_PERMANENT=1` la vuelve 308 cuando el cambio de dominio sea definitivo.
  - `NIDUX_STORE_URL` cambia el destino.

## 2. Qué cubre Nidux de lo que SLOW ya hacía

| Función en SLOW | Equivalente en Nidux |
| --- | --- |
| Catálogo, variantes, categorías, marcas, atributos | Admin > Catálogo (incluye modificadores y feeds) |
| Carrito y checkout, cuentas de cliente, favoritos | Tienda + lista de deseos (opción a habilitar) |
| Pedidos, reportes | Admin > Pedidos y Reportes; POS > Reportes (ventas, kardex, vendedores, etc.) |
| Layaways (apartados) | POS > Créditos, apartados y cotizaciones |
| Cotizaciones | Admin > Cotizaciones y Proformas; POS cotizaciones |
| Venta en tienda (admin/pos) | POS > Ventas en curso |
| Inventario (entradas, ajustes, bodegas) | POS > Ingreso de mercadería, Salida, Auditoría, Sucursales/Bodegas |
| Puente Loyverse | Sincronización POS ↔ eCommerce (ya activa) |
| Descuentos | Cupones, Descuentos avanzados, Promociones avanzadas (POS), Gift cards |
| Correos transaccionales | Plantillas de correo personalizadas |
| CRM de clientes | Clientes con categorías y programas, canal de WhatsApp |

## 3. Qué tiene SLOW que Nidux no mostró

- Costeo de importación (lotes, tipo de cambio, márgenes): `backend/inventory-*.mjs`. Nidux solo tiene costo por proveedor y calculadora de margen.
- Reseñas con moderación. No se encontró equivalente.
- Cotización de mensajería Uber Direct y DiDi. Nidux ofrece Correos de Costa Rica (Pymexpress) y tarifas por compra, país, producto, zona y avanzado.
- Caja chica (`petty-cash`). No aparece en el POS.
- Webhooks/outbox hacia CRM y analítica propios. Corrección: Nidux sí ofrece dos webhooks (Admin > Configuración > General > Webhook): "URL para recibir notificaciones de órdenes" y "URL para recibir notificaciones de actividades API". Ambos están sin configurar. También permite claves propias de Google Maps y SendGrid.

## 4. Funciones nuevas de Nidux por aprovechar

- Canal de WhatsApp con agentes e intenciones de compra (hoy desactivadas).
- Email marketing, Mailchimp, reporte de carrito abandonado.
- Búsqueda avanzada, lista de deseos, feeds Meta/Google, Facebook, links de pago.
- Usuarios adicionales (3), listas de precios, mapa de calor, QR de tienda.

## 5. Pendientes detectados en la configuración

- Factura electrónica (POS > Configuración > Impuestos): código de actividad en "0000.1 Preoperativa", tiquete electrónico por defecto apagado. Cargar actividad, régimen y CAByS reales.
- Comprobante (Admin > Configuración): cédula jurídica y nombre de fantasía vacíos. Dirección de la empresa vacía.
- PlaceToPay del banco: aparece activo; confirmar la configuración con el banco.
- "Ventana para devoluciones (días)" del POS debe coincidir con la política publicada.
- Sin configurar: API key de Google Maps, API key de SendGrid, recaptcha.
- Páginas legales: completar razón social, cédula, dirección y plazos concretos; revisión legal.
- Logo: Nidux pide PNG/SVG de 1000×250; el actual mide 1218×492.
- SLW-053, SLW-054 y SLW-021 (Aurora Negro) sin mosaico ni precio/nombre definitivos.

## 6. Plan por fases

1. **Cumplimiento y cobro:** cédula y datos legales, factura electrónica, PlaceToPay, plazo de devoluciones, envíos con Correos, pedido de prueba completo hasta la factura.
2. **Operación:** WhatsApp y intenciones de compra, correos en español e inglés, recaptcha, búsqueda avanzada, lista de deseos.
3. **Marketing:** Mailchimp, cupón de bienvenida, carrito abandonado, feeds, analítica.
4. **Puente de costos y catálogo:** mantener el costeo en SLOW y pasar costos y los 1,495 borradores a Nidux con importación por Excel.
5. **Decidir qué retirar de SLOW:** reseñas, caja chica y mensajería requieren solución aparte o seguir en SLOW.

## 7. Cómo integrar

- Salida de pedidos: webhook de órdenes de Nidux hacia un endpoint propio (por ejemplo una ruta en el sitio desplegado en Cloudflare que valide un secreto y reenvíe a CRM/analítica). El formato del payload se descubre con un pedido de prueba.
- Catálogo y costos: importación/exportación de Excel (Admin > Productos > Importar/Exportar; POS > Importar) o automatización de navegador.
- El webhook "actividades API" sugiere que existe una API de Nidux; pedir la documentación y credenciales a soporte.

## 8. Avance

- [x] Redirección de la raíz `slowfitcr.com/` a la tienda (desplegada al hacer push a `master`).
- [x] Pruebas: `npm run test:unit` (redirección, corre en CI) y `npm run test:smoke` (6 pruebas de humo sobre la tienda real: redirección, home, enlaces legales, términos con seguridad y políticas al final, categoría con productos, producto con stock/color/talla).
- [x] SKU del POS alineados con el catálogo (SLW001..SLW027, SLWA01..SLWA25).
- [x] Lista de deseos ya estaba habilitada.
- [ ] Recaptcha en inicio de sesión: el interruptor no quedó activo al intentarlo; revisar si exige claves.
- [ ] Webhook de órdenes: requiere un secreto en Cloudflare (`wrangler login`) y un endpoint desplegado.
- [ ] Factura electrónica, PlaceToPay, datos legales: requieren datos del negocio.
- [x] Tienda Nidux: categorías del menú Tienda con imagen y nombres en español (Colección Performance, Performance para Él, Accesorios) y eslogan "SLOW is smooth, smooth is fast" en el pie de página.
- [x] Tienda Nidux: precios sin decimales y con tipografía Cormorant (CSS Adicional); diseño móvil de cabecera y hero arreglado.
- [x] **Carrusel "Conjuntos"** en la home, debajo de "Colecciones": carrusel de productos nativo de Nidux con el mosaico de los 10 conjuntos de 2 piezas (Marea, Aurora, Alba, Armonía, Coral, Duna, Ámbar, Calma, Refugio, Brío), cada slide enlazado a su producto. Para agregar o quitar uno: Tema Phoenix > Secciones > Conjuntos > Configurar Contenido (la imagen que sale es la primera foto del producto; si el selector muestra otra, abrir el producto en el POS y pulsar "Actualizar").
  - Límites: la sección solo admite nombre (sin subtítulo ni versión en inglés) y los mosaicos traen precio y tallas dibujados, así que se desactualizan si cambian.

## 9. Pendiente para el sitio de SLOW

- [ ] **Carrusel de conjuntos/mosaicos en el sitio propio**: reutilizar los mosaicos del catálogo (`Catalogo_Unificado_Imagenes`, 4:5) como carrusel por conjuntos en la home de `slowfit-site`, con enlace a cada producto y opción de agrupar (conjuntos, mujer, hombre). Idealmente administrable desde el admin de catálogo (elegir qué producto y qué imagen se muestra), reutilizando el orden de imágenes ya disponible.
- [ ] Decidir si los mosaicos se muestran como imagen completa (con precio y tallas dibujados) o solo como foto, para evitar que queden desactualizados.

