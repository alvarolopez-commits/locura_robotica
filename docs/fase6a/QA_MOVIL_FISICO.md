# Prueba final con móvil físico

**Estado: pendiente de prueba física.** Nadie ha ejecutado esta checklist en un dispositivo real. Ninguna casilla está marcada y no hay capturas ni vídeos.

Hacerla sobre un entorno HTTPS de pruebas (no solo emulación de Chrome), en dos dispositivos: **iPhone/Safari** y **Android/Chrome**. 15–25 minutos por dispositivo. Usar cuentas, colecciones y mazos de prueba.

## Dispositivos

| | Modelo | OS y versión | Navegador y versión | URL / versión de la app | Fecha y hora | Quién |
|---|---|---|---|---|---|---|
| iOS | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente |
| Android | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente |

## Secuencia (marcar resultado: OK / FALLO + id de incidencia)

| # | Paso | iOS | Android |
|---|---|---|---|
| 1 | **Navegación:** entrar y salir de Catálogo, Colección, Mis mazos y Competición; el menú inferior no tapa botones | pendiente de prueba física | pendiente de prueba física |
| 2 | **Búsqueda:** por nombre y código; filtros de nivel, color y propiedad; cuadrado bicolor diagonal | pendiente de prueba física | pendiente de prueba física |
| 3 | **Colección:** sumar/restar copias; recargar y confirmar persistencia | pendiente de prueba física | pendiente de prueba física |
| 4 | **Mis mazos:** crear/copiar/eliminar con confirmación; los existentes siguen intactos | pendiente de prueba física | pendiente de prueba física |
| 5 | **Constructor:** editar y pulsar «Hecho»; sale del modo construcción sin pérdida | pendiente de prueba física | pendiente de prueba física |
| 6 | **Competición:** alternar GD06/GD05, filtrar, entrar a un torneo y volver conservando filtros y scroll | pendiente de prueba física | pendiente de prueba física |
| 7 | **Torneos:** no aparecen duplicados; los eventos `single_deck` no cuentan en la presencia por defecto | pendiente de prueba física | pendiente de prueba física |
| 8 | **Comparador:** desde una lista verificada de 50, comparar con un mazo propio; cantidades exactas y disponibilidad de colección | pendiente de prueba física | pendiente de prueba física |
| 9 | **Variante:** crear un mazo nuevo con id distinto; volver al original y comprobar que no cambió; recargar | pendiente de prueba física | pendiente de prueba física |
| 10 | **Favoritos** (con sesión): marcar y desmarcar; sincronización en otro dispositivo **solo después** de validar Supabase/RLS en staging | pendiente de prueba física | pendiente de prueba física |
| 11 | **Accesibilidad:** objetivos táctiles, contraste, zoom al 200 %, el teclado virtual no oculta campos | pendiente de prueba física | pendiente de prueba física |
| 12 | **Resiliencia:** volver desde otra app, rotar, perder y recuperar conexión; sin duplicados ni pérdidas silenciosas | pendiente de prueba física | pendiente de prueba física |

### Recorrido completo (obligatorio en ambos)
Descubrir una lista verificada → compararla → ver faltantes → crear variante sin mutar el original → salir de construcción → recargar → verificar persistencia.

## Registro de incidencias

| ID | Pantalla | Dispositivo / OS | Pasos para reproducir | Esperado | Observado | Gravedad (P0–P3) | Captura o vídeo (sin datos sensibles) | Estado | Responsable |
|---|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — | — |

## Criterio de salida
P0 = 0 y P1 = 0; recorridos principales completados en **ambos** dispositivos; P2/P3 corregidos o aceptados por escrito.
