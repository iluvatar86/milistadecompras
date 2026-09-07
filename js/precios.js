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
  /* Los artículos «a mano» se quitan AQUÍ, en el único sitio por el que pasa
     toda consulta, y no en cada pantalla que llame a esta función. No tienen
     código de barras: mandarlos haría que el intermediario preguntase por un
     código vacío a los cinco supermercados —cinco consultas por artículo, todas
     con la misma respuesta vacía— y esa respuesta se guardaría como «no lo
     vende», que es justo lo que no queremos que diga de ellos. */
  async function consultar(articulos) {
    const consultables = articulos.filter((a) => !a.libre);
    if (!consultables.length) return null;

    const datos = await enviarPrecios(
      consultables.map((a) => ({ ean: a.ean || '', amId: a.amId || '' })));

    Store.guardarPrecios(datos, consultables.map((a) => a.id));
    return datos;
  }

  /* El envío en crudo, sin guardar nada. Lo comparten la consulta de precios de
     la lista y la búsqueda por código de barras, que necesita exactamente la
     misma pregunta pero NO puede guardar el resultado: cuando se busca por
     código, el artículo todavía no existe y no hay ningún id al que atarlo. */
  function enviarPrecios(items) {
    return pedir(url('precios'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // ver cabecera
      body: JSON.stringify({
        sucursalAM: Store.ajustes().sucursalAM || '06',
        items: items
      })
    });
  }

  /* ---------- buscar por código de barras ------------------------------------- */

  /* NO HACE FALTA NINGUNA OPERACIÓN NUEVA EN EL INTERMEDIARIO, y conviene que
     siga siendo así: buscar por código es literalmente lo que hace la consulta
     de precios —los cuatro adaptadores VTEX y Megasuper preguntan por el EAN—,
     solo que aquí interesa el NOMBRE que devuelven y no el precio. Reusar
     'precios' significa que esto funciona con el script que Pablo ya tiene
     publicado, sin volver a pegar nada.

     Auto Mercado se queda fuera, y no es un olvido: no guarda el código de
     barras, así que por código es imposible encontrarlo ahí. El artículo nace
     sin emparejar y se empareja en su ficha, igual que al buscarlo por nombre. */

  const ORDEN_DEL_NOMBRE = ['masxmenos', 'walmart', 'maxipali', 'megasuper'];

  function soloDigitos(texto) {
    return String(texto || '').replace(/\D+/g, '');
  }

  /* El último dígito de un código de barras se calcula a partir de los demás,
     así que un número mal tecleado se puede detectar SIN preguntarle a nadie.

     Merece la pena comprobarlo: sin esto, un dígito cambiado da «no lo
     encontré», que es indistinguible de «no lo venden» y manda a buscar el
     producto equivocado. Con esto se puede decir «ese número está mal escrito».

     Se rellena a 14 dígitos por la izquierda para que la misma cuenta valga
     para EAN-8, UPC-12 y EAN-13. */
  function codigoValido(ean) {
    if (!/^(\d{8}|\d{12,14})$/.test(ean)) return false;
    const d = ean.padStart(14, '0').split('').map(Number);
    let suma = 0;
    for (let i = 0; i < 13; i++) suma += d[i] * (i % 2 === 0 ? 3 : 1);
    return (10 - (suma % 10)) % 10 === d[13];
  }

  /* De la respuesta de precios saca lo que identifica al producto: su nombre y
     en qué tiendas apareció. El nombre se toma de la primera tienda que lo
     traiga, en orden: Más x Menos suele tener el nombre más completo. */
  function leerHallazgo(ean, datos) {
    const item = datos && datos.items && datos.items[0];
    if (!item) return null;
    const tiendas = item.tiendas || {};

    let nombre = '';
    for (let i = 0; i < ORDEN_DEL_NOMBRE.length; i++) {
      const t = tiendas[ORDEN_DEL_NOMBRE[i]];
      if (t && t.nombre) { nombre = t.nombre; break; }
    }
    /* Sin nombre no hay producto: las cuatro tiendas contestaron «no lo vende».
       Un artículo con un código y sin nombre no le sirve de nada a nadie. */
    if (!nombre) return null;

    const conPrecio = Object.keys(tiendas)
      .filter((id) => tiendas[id] && tiendas[id].hay && tiendas[id].precio)
      .map((id) => ({ id: id, precio: Number(tiendas[id].precio) }))
      .sort((a, b) => a.precio - b.precio);

    return { ean: ean, nombre: nombre, enTiendas: conPrecio };
  }

  async function porCodigo(codigo) {
    const ean = soloDigitos(codigo);
    if (!ean) throw new Error('Escribe el código de barras: son solo números.');
    if (!codigoValido(ean)) {
      throw new Error('Ese código no cuadra (' + ean + '). El último dígito se calcula a partir de los demás y no da. Revisa que no falte ni sobre ningún número.');
    }

    const datos = await enviarPrecios([{ ean: ean, amId: '' }]);
    let hallazgo = leerHallazgo(ean, datos);
    let respuesta = datos;

    /* Lo importado de Estados Unidos trae 12 dígitos (UPC) y los supermercados
       lo guardan con un cero delante, en formato de 13. Solo se reintenta
       cuando ya falló, así que no cuesta nada en el caso normal. */
    if (!hallazgo && ean.length === 12) {
      const conCero = '0' + ean;
      const otros = await enviarPrecios([{ ean: conCero, amId: '' }]);
      const segundo = leerHallazgo(conCero, otros);
      if (segundo) { hallazgo = segundo; respuesta = otros; }
    }

    return { ean: hallazgo ? hallazgo.ean : ean, hallazgo: hallazgo, respuesta: respuesta };
  }

  /* Comprobación de Ajustes: dice si el intermediario está vivo sin consultar
     ningún precio. */
  async function probar() {
    const datos = await pedir(url('ping'));
    return !!(datos && datos.ok);
  }

  global.Precios = { buscar, consultar, probar, porCodigo, codigoValido, soloDigitos };

})(window);
