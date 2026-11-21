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
- Webhooks/outbox hacia CRM y analítica. No hay sección de API o webhooks visible; preguntar a soporte de Nidux.

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

No hay API visible. Las integraciones serían por importación/exportación de Excel (Admin > Productos > Importar/Exportar; POS > Importar) o automatización de navegador. Confirmar con soporte de Nidux si existe API o webhooks antes de construir nada más.
