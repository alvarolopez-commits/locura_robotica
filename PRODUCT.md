# PRODUCT — Locura robótica

**Qué es:** catálogo y constructor de mazos de Gundam Card Game (PWA). 1086 cartas, filtros por habilidad y rasgos, links piloto/unidad, efectos en español, Mis mazos, Mi colección, Meta Lab y Competición. Cuenta sincronizada con Supabase.
**Para quién:** jugadores y coleccionistas hispanohablantes que consultan y montan mazos, sobre todo desde el móvil.
**Tono:** directo, en español, nombres de acción en los controles; los errores dicen el problema y cómo recuperarse.

## Principios de producto
1. **Móvil primero.** Se diseña a 320–390 px y se amplía; nunca al revés.
2. **Un componente por función.** La misma tarea (lista de mazo, contador de copias) usa el mismo componente en todas las pantallas.
3. **Funciona sin conexión.** Los datos y las imágenes vistas quedan en caché; la nube sincroniza sola y sin avisos de alarma.
4. **Reglas del juego en un solo sitio.** La legalidad de mazos vive en `legality.js` y se prueba con tests.
5. **No se publica sin permiso expreso.** Sin commits ni despliegues por iniciativa propia.
