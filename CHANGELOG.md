# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

## [1.1.0] - 2026-11-08

### Agregado
- Botón **Publicar** (en el panel, el editor y la ventana de la extensión): abre Marketplace en una pestaña nueva y rellena el formulario solo. El clic final en *Publicar* de Facebook sigue siendo tuyo.
- Campos nuevos: disponibilidad, etiquetas de productos (hasta 20), SKU, preferencias de entrega y ocultar a amigos.
- “Promocionar tras publicar” siempre se deja apagado.
- **✨ Sugerir descripciones** vendedoras y **✨ Sugerir etiquetas** a partir de beneficios, características y títulos (sin internet).

### Cambiado
- El precio se redondea a número entero al rellenar (Facebook no acepta centavos) y el editor lo avisa.
- “Rellenar esta página” aparece solo cuando ya estás en el formulario de Marketplace.

## [1.0.0] - 2026-11-08

### Agregado
- Plantillas (borradores) ilimitadas, agrupadas por cliente, con duplicar, editar y eliminar.
- Rellenar con un clic el formulario *Artículo en venta*: fotos, título, precio, categoría, estado, descripción y ubicación.
- Rotación sin repetir títulos ni fotos, con aviso de existencias bajas.
- Variables en títulos y descripciones (`{marca}`, `{ciudad}`, `{precio}`, `{cliente}`, `{fecha}`).
- Guardar un formulario de Facebook como plantilla.
- Detección del botón *Publicar* y opción *Marcar como publicado*.
- Calendario lunes, miércoles y viernes con recordatorio a las 08:00 (editable), saltar día y *solo renovar*.
- Historial, respaldo e importación (incluye fotos).
- Interfaz en español e inglés.
