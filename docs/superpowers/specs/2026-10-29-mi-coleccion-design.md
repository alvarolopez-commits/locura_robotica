# Mi colección — diseño

**Fecha:** 29 oct 2026 · **Proyecto:** Locura robótica (`dashboard.html`, JS sin framework, PWA en Vercel) · **Estado:** pendiente de aprobación; nada construido.

## 1. Intención y por qué

El catálogo muestra **todas las cartas que existen**. Quien juega no las tiene todas: tiene mazos iniciales y las cartas que ha comprado. Hoy la app no sabe cuáles son, así que al montar un mazo no se ve qué cartas le faltan.

**Mi colección** es la lista de cartas que la persona **tiene en su poder**. Sirve para dos cosas:

1. Montar mazos más fácilmente sabiendo lo que se tiene.
2. Ver, dentro de un mazo, qué cartas no se tienen, para **decidir si comprarlas o no**. No se trata de impedir mazos con cartas que no se tienen; se trata de que se vean.

> Antecedente: ya existió una etiqueta "Tengo" y un filtro "Solo mi colección", que se quitaron porque se alimentaban de un dato fijo del catálogo y no de lo que tiene cada persona. Esto es distinto: **la colección la edita la persona**.

## 2. Objetivos

- Marcar una carta como "la tengo" con un solo toque desde el catálogo, y quitarla igual de fácil.
- Rellenar la colección de golpe con un **mazo inicial completo (ST01–ST14)**.
- Etiqueta **"TENGO"** en las cartas marcadas, solo cuando la colección existe.
- En la lista de cartas de un mazo, las cartas que no se tienen se ven **atenuadas con el aviso "No la tengo"**.
- Una pantalla **"Mi colección"**, accesible desde el usuario.

## 3. No-objetivos (por ahora)

- **Sin cantidades.** O la tienes o no. La persona ha pedido simplificarlo y revisarlo más adelante "si importa".
- Sin comparación "el mazo usa 4 y tengo 2".
- Sin filtro "solo lo que tengo" en el catálogo (se puede añadir luego).
- Sin importar/exportar la colección, sin precios ni enlaces de compra.
- Sin lista de la compra agregada entre mazos.

## 4. Anti-objetivos (fracaso aunque "funcione")

- Que un mazo con cartas no poseídas quede **bloqueado o marcado como ilegal**. Tener o no tener una carta no afecta a la legalidad del mazo.
- Que aparezcan etiquetas "TENGO" o avisos "No la tengo" en quien **no ha creado su colección** (debe verse exactamente como hoy).
- Que añadir a la colección se confunda con añadir al mazo.
- Perder la colección al cerrar sesión o al recargar.

## 5. Decisiones tomadas por la persona

1. **Catálogo y colección son cosas distintas.** Catálogo = todas las cartas; Mi colección = las que tiene.
2. **Botón en cada carta del catálogo:** nombre **"Añadir a mi colección"**, color **`#221e41`**.
   - Ya añadida: el botón pasa a **`#1a4d7a`** y dice "En mi colección".
   - Junto a él, un botón de **papelera `#dce5ed`** que quita la carta de la colección.
   - Se coloca **debajo de los botones del mazo** (opción "A" de la maqueta). El verde queda descartado.
3. **Etiqueta "TENGO"** sobre la imagen de las cartas añadidas. **Solo se activa cuando se ha creado la colección** (hay al menos una carta añadida).
4. **Acceso:** al pulsar el enlace del usuario (avatar) aparece un botón que lleva a **Mi colección**.
5. **Pantalla Mi colección:** pestañas **Mazos iniciales**, **Expansiones** y **Todas**.
   - **Mazos iniciales:** una fila por ST01–ST14 con un botón que marca todas sus cartas de golpe; volver a pulsarlo las quita. Marcar o desmarcar un mazo inicial solo afecta a las cartas de ese mazo; las cartas sueltas añadidas aparte se conservan.
   - **Expansiones (GD01–GD06, EB01):** se rellenan carta a carta, con el mismo botón que en el catálogo.
6. **En un mazo, una carta que no se tiene:** fila **atenuada** y aviso **"No la tengo"** de color **`#d86565`**, y además (opción "C", pedido el 29 oct) un **aviso arriba del mazo** con el resumen y la lista: "Te faltan N cartas de este mazo" (se cuentan cartas distintas con al menos 1 copia en el mazo; plegable si hay más de 6). Solo si la colección existe.

## 6. Restricciones

- Un solo archivo `dashboard.html` con JS sin framework; ES por defecto y EN; sin dependencias nuevas.
- Respetar el estilo actual (cortes en diagonal, tipografía display) y los tokens de color existentes; los colores indicados por la persona van tal cual.
- Accesibilidad: botones con nombre accesible ("Añadir a mi colección · Gundam", "Quitar de mi colección · Gundam"), área táctil de al menos 44 px en las cartas del catálogo, foco visible, teclado.
- Funciona sin conexión y sin sesión.
- No cambiar la lógica de legalidad de mazos ni el formato de los mazos guardados.

## 7. Decisiones mías (a revisar al leer)

- **Nombre:** "Mi colección" en toda la interfaz (la persona dijo a veces "mi catálogo").
- **Modelo:** la colección es un **conjunto de números de carta** (sin cantidad). Un "mazo inicial" son **todas las cartas del catálogo cuyo set es `STnn`** (ST01–ST04: 16 cartas; ST05–ST08: 15; ST09: 10; ST10–ST14: 16). Una carta pertenece a un solo set, así que mazos iniciales y cartas sueltas no se pisan.
- **Persistencia, primera entrega:** guardada **en el dispositivo** (almacenamiento local), igual que los mazos sin sesión. Sobrevive a cerrar sesión y a recargar. La sincronización con la cuenta queda como **segunda fase** (necesita una tabla nueva en Supabase); ver pregunta abierta.
- **Pestañas de Mi colección:** "Expansiones" muestra la rejilla del catálogo limitada a GD/EB con el mismo botón; "Todas" muestra solo **lo que ya se ha añadido**, agrupado por set, con papelera para quitar.
- **Cabecera de la pantalla:** título "Mi colección" y total de cartas distintas, p. ej. "212 cartas distintas".
- **Entrada extra:** además del botón en la ventana del usuario, la entrada de menú "Mi cuenta / Iniciar sesión" no cambia; Mi colección **no** exige iniciar sesión.
- **Sin colección:** si está vacía, no hay etiquetas ni avisos, y la pantalla Mi colección explica en una frase cómo empezar y ofrece los mazos iniciales.
- **Qué pasa al vaciar la última carta:** la colección vuelve a estar "no creada" y desaparecen etiquetas y avisos.
- **Tests:** módulo de colección con funciones puras (añadir, quitar, marcar/desmarcar mazo inicial, ¿existe colección?, ¿falta esta carta?) con pruebas en Node; pruebas de interfaz en Chrome sin interfaz a 390 y 1280 px.

## 8. Pregunta abierta (solo de la persona)

**¿Quieres que la colección se guarde también en tu cuenta** para tenerla en el móvil y en el ordenador? Si sí, hace falta crear una tabla nueva en Supabase (un paso en su panel) y es una **segunda entrega**; la primera funciona ya en el dispositivo.

## 9. Qué queda para quien lo construya

- Estructura exacta del almacenamiento local y de las funciones del módulo.
- Textos finales en español e inglés.
- Detalles de maquetación de la pantalla Mi colección dentro del estilo actual (modal o página, como Mis mazos).
- Animación y feedback al pulsar los botones (en línea con el resto de la app).
