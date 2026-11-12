// Ayuda para las pruebas de UI: desde el 12 nov 2026 la app abre SIN mazo seleccionado, así que las pruebas que parten de «un mazo activo» lo eligen por la interfaz
// (Ver mis mazos → el mazo → Añadir cartas), igual que haría una persona. Con { building:false } sale después del modo construcción con «Hecho»
// (el estado de antes cuando no se sembraba msa_building). Devuelve el código a evaluar en la página (con awaitPromise).
export const elegirMazoJS = (id, { building = false } = {}) => `(async function(){
  var w = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var d = JSON.parse(localStorage.getItem('msa_decks') || '{}')[${JSON.stringify(id)}]; if(!d) return 'sin mazo';
  document.getElementById('btnMyDecks').click(); await w(800);
  var t = Array.from(document.querySelectorAll('.dp-deck')).find(function(x){ return x.textContent.indexOf(d.name) >= 0; }); if(!t) return 'sin tarjeta'; t.click(); await w(800);
  document.getElementById('dpAddCards').click(); await w(900);
  ${building ? '' : "document.getElementById('deckCount').click(); await w(900); var dn = document.getElementById('dvDone'); if(dn && !dn.hidden) dn.click(); await w(700);"}
  return 'ok'; })()`;
