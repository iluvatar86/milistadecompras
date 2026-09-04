/* ---------------------------------------------------------------------------
   precios.js — Hablar con el intermediario.

   POR QUÉ HAY UN INTERMEDIARIO (no borrarlo pensando que sobra):

   Ninguno de los cinco supermercados envía la cabecera
   'Access-Control-Allow-Origin', así que el navegador PROHÍBE que esta app les
   pida datos directamente. Comprobado en vivo: la consulta muere con
   "blocked by CORS policy". No es un candado que se pueda saltar con código ni
   con un truco de cabeceras: es una regla del navegador y no depende de
   nosotros.

   El intermediario es un Google Apps Script del propio usuario que hace la
   consulta desde el servidor de Google, donde esa regla no aplica. No guarda
   nada: pregunta y contesta. Está en la carpeta 'intermediario' del proyecto.

   DETALLE QUE PARECE UNA TONTERÍA Y NO LO ES: el envío va con
   Content-Type 'text/plain'. Con 'application/json' el navegador manda antes
   una consulta OPTIONS de comprobación, y Apps Script no sabe responderla: la
   app fallaría sin ninguna explicación útil. 'text/plain' la manda directa.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  /* Apps Script no es rápido: la primera consulta del día puede tardar varios
     segundos mientras Google despierta el script. Un minuto es de sobra y
     evita que la app se quede colgada para siempre si algo va mal. */
  const TIEMPO_MAXIMO = 60000;

  function sinConfigurar() {
    return new Error('Todavía no has conectado el intermediario. Ve a Ajustes y pega su dirección.');
  }

  function url(op) {
    const a = Store.ajustes();
    const base = String(a.url || '').trim();
    if (!base || !a.clave) throw sinConfigurar();
    const unir = base.indexOf('?') >= 0 ? '&' : '?';
    return base + unir + 'clave=' + encodeURIComponent(a.clave) + '&op=' + op;
  }

  /* Un solo sitio por donde pasan todas las consultas, para que el manejo de
     fallos esté escrito una vez. Los tres fallos que se ven de verdad son:
     no haber configurado nada, no tener internet, y la clave mal escrita. */
  async function pedir(direccion, opciones) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO);

    let res;
    try {
      res = await fetch(direccion, Object.assign({ signal: control.signal }, opciones || {}));
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('El intermediario tardó demasiado en contestar. Vuelve a intentarlo.');
      }
      /* Aquí caen tanto «no hay internet» como «la dirección está mal escrita».
         El navegador no deja distinguirlas, así que se nombran las dos en vez
         de adivinar y equivocarse. */
      throw new Error('No se pudo hablar con el intermediario. Revisa que tengas internet y que la dirección de Ajustes sea correcta.');
    } finally {
      clearTimeout(reloj);
    }

    if (!res.ok) throw new Error('El intermediario contestó con un error (' + res.status + ').');

    let datos;
    try {
      datos = await res.json();
    } catch (err) {
      /* Pasa cuando la dirección apunta a algo que no es el script, o cuando
         Apps Script devuelve su propia página de error en HTML. */
      throw new Error('El intermediario devolvió algo que no se entiende. Revisa que la dirección termine en /exec.');
    }

    if (datos && datos.error) {
      if (datos.error === 'clave incorrecta') {
        throw new Error('La clave no coincide con la del intermediario. Revísala en Ajustes.');
      }
      throw new Error(datos.error);
    }
    return datos;
  }

  /* ---------- buscar un artículo para agregarlo ------------------------------ */

  /* Devuelve dos listas por separado, y no es capricho:

     - 'conCodigo' sale de Más x Menos, que sí publica el código de barras. Con
       ese código quedan resueltos de golpe Walmart, Maxi Palí y Megasuper.
     - 'autoMercado' va aparte porque Auto Mercado NO publica el código de
       barras. Su artículo hay que emparejarlo a mano una vez.

     Juntarlas en una sola lista escondería justo la diferencia que el usuario
     necesita entender para saber por qué le pedimos dos toques y no uno. */
  /* `alternativa` es una consulta más corta que el intermediario usa SOLO si la
     principal no encuentra nada en Auto Mercado. Hace falta porque los
     supermercados nombran el mismo producto distinto y el buscador de Auto
     Mercado exige todas las palabras: «Arroz Tío Pelón 99% grano entero» no
     encuentra «ARROZ BLANCO 99% TIO PELON», porque «grano entero» no está ahí.
     Va en la misma consulta, así que no cuesta tiempo. */
  async function buscar(texto, alternativa) {
    let direccion = url('buscar') + '&q=' + encodeURIComponent(texto);
    if (alternativa) direccion += '&qAlt=' + encodeURIComponent(alternativa);

    const datos = await pedir(direccion);
    const salida = {
      conCodigo:     datos.conCodigo || [],
      autoMercado:   datos.autoMercado || [],
      amConRespaldo: !!datos.amConRespaldo,
      amConsulta:    datos.amConsulta || texto
    };

    /* El respaldo lo hace el intermediario en una sola tanda, sin coste. Pero un
       intermediario que todavía no se haya actualizado ignora `qAlt` sin decir
       nada, y entonces el emparejamiento seguiría fallando.

       Por eso la app reintenta por su cuenta cuando ve que no vino nada y el
       respaldo no llegó a usarse. Cuesta una consulta más —y solo en el caso que
       ya estaba fallando—, y a cambio esto funciona con el intermediario viejo y
       con el nuevo. Cuando el de Pablo se actualice, esta rama deja de
       ejecutarse sola: no hay nada que quitar después. */
    if (!salida.autoMercado.length && alternativa && alternativa !== texto && !salida.amConRespaldo) {
      try {
        const segundo = await pedir(url('buscar') + '&q=' + encodeURIComponent(alternativa));
        if (segundo.autoMercado && segundo.autoMercado.length) {
          salida.autoMercado = segundo.autoMercado;
          salida.amConRespaldo = true;
          salida.amConsulta = alternativa;
        }
      } catch (err) {
        // El reintento es un extra: si falla, se devuelve lo que ya había.
        console.warn('El reintento en Auto Mercado no funcionó:', err.message);
      }
    }

    return salida;
  }

  /* ---------- consultar precios ---------------------------------------------- */

  /* Se mandan TODOS los artículos en una sola consulta. El intermediario los
     reparte en paralelo entre los cinco supermercados. Mandarlos de uno en uno
     desde aquí sería más simple de escribir y muchísimo más lento: con quince
     artículos serían quince viajes de ida y vuelta a Google, cada uno con su
     propio arranque. */
  async function consultar(articulos) {
    if (!articulos.length) return null;

    const cuerpo = {
      sucursalAM: Store.ajustes().sucursalAM || '01',
      items: articulos.map((a) => ({ ean: a.ean || '', amId: a.amId || '' }))
    };

    const datos = await pedir(url('precios'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // ver cabecera
      body: JSON.stringify(cuerpo)
    });

    Store.guardarPrecios(datos, articulos.map((a) => a.id));
    return datos;
  }

  /* Comprobación de Ajustes: dice si el intermediario está vivo sin consultar
     ningún precio. */
  async function probar() {
    const datos = await pedir(url('ping'));
    return !!(datos && datos.ok);
  }

  global.Precios = { buscar, consultar, probar };

})(window);
