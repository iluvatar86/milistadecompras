/* ---------------------------------------------------------------------------
   comparar.js — Decidir dónde comprar. No toca la pantalla ni la red: recibe
   artículos y precios y devuelve números, así que se puede razonar sobre él
   solo.

   Hay DOS preguntas distintas y la app las responde por separado a propósito,
   porque mezclarlas da consejos malos:

   1. «¿Dónde está más barato ESTE artículo?» — útil cuando ya estás en un
      súper, o para un artículo suelto.

   2. «¿A qué súper voy con TODA la lista?» — casi siempre la que importa. No
      vas a manejar a cinco supermercados por ahorrar ₡450, así que lo que
      necesitas saber es qué carro completo sale más barato.

   Y una regla de honestidad que atraviesa todo el archivo:

   UN SUPERMERCADO QUE NO TIENE UN ARTÍCULO NO PUEDE GANAR POR ESO. Si sumaras
   solo lo que sí vende, al que le faltan tres cosas le saldría el carro más
   barato y ganaría la comparación siendo el peor sitio para ir. Por eso los
   carros incompletos se apartan y se dice cuántos artículos les faltan.

   LOS ARTÍCULOS «A MANO» (art.libre) SON EL OTRO LADO DE ESA MISMA REGLA.

   Son cosas que no se buscan en ningún supermercado —el pan de la panadería,
   las verduras de la feria— y que por tanto no dicen nada sobre a cuál ir. Aquí
   se tratan así:

   - No cuentan como «le falta» a nadie. Ningún supermercado queda descalificado
     por no tener un artículo que ni siquiera se le preguntó.
   - Su precio, si se escribió, se suma IGUAL a todos los carros. Al sumar lo
     mismo en todas partes no puede cambiar quién gana —que es exactamente lo
     que pidió Pablo— y a cambio el total de la pantalla es el total de verdad,
     no una cifra a la que le falta el pan.
   - Aparecen en la lista desplegada de todos los supermercados, pero NO en gris
     ni tachados: el gris significa «este súper no lo vende», y eso sería
     mentira. Aquí simplemente no se preguntó.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  /* TRAMPA DE JAVASCRIPT, ya pisada una vez: Number(null) vale 0, y 0 pasa la
     prueba de Number.isFinite. Escrito de la forma evidente
     —Number.isFinite(Number(info.precio))— un precio ausente se convertía en
     cero, y la app enseñaba «₡0,00/kg» en un arroz que ese supermercado ni
     siquiera vende. Hay que descartar null y '' ANTES de convertir. */
  function leerPrecio(info) {
    if (!info) return null;
    const bruto = info.precio;
    if (bruto === null || bruto === undefined || bruto === '') return null;
    const n = Number(bruto);
    return Number.isFinite(n) ? n : null;
  }

  /* Por qué una tienda no tiene precio, cuando ni siquiera aparece en la
     respuesta guardada.

     Distinguir esto importa: Auto Mercado no manda nada de un artículo que no
     se ha emparejado con su catálogo, y decir «sin consultar» invitaba a pulsar
     «Consultar precios» otra vez, que no lo arregla nunca. Lo que hay que hacer
     es emparejarlo, y eso solo se sabe si el texto lo dice. */
  function sinDato(tienda, art, guardado) {
    if (tienda.id === 'automercado' && !art.amId) return 'sin emparejar';
    if (!guardado) return 'sin consultar';
    return 'no lo vende';
  }

  /* El precio escrito a mano, ya normalizado, o null si no se escribió ninguno.
     Null y cero son cosas distintas y hay que mantenerlas separadas: «no sé lo
     que cuesta» no es «es gratis». */
  function precioAMano(art) {
    return Store.precioAMano(art.precioManual);
  }

  function cuantos(art) {
    return Math.max(1, Number(art.cantidad) || 1);
  }

  /* ---------- un artículo ----------------------------------------------------- */

  /* Devuelve una fila por tienda activa, ordenadas de más barata a más cara, y
     marca cuál es la mejor. Las tiendas sin precio van al final: son una
     respuesta legítima («no lo vende»), no un error, pero no compiten. */
  function porArticulo(art) {
    /* Un artículo a mano no tiene filas que enseñar: no hay cinco precios, hay
       uno o ninguno. Se devuelve con la misma forma para que nadie tenga que
       preguntar si el resultado es de un tipo o de otro, pero con 'mejor' en
       null, porque no hay ningún supermercado que recomendar. */
    if (art.libre) {
      return {
        articulo: art, libre: true, precioManual: precioAMano(art),
        consultadoEn: null, filas: [], mejor: null, mejores: [],
        ahorro: 0, empate: false
      };
    }

    const guardado = Store.preciosDe(art.id);
    const tiendas = Store.tiendasActivas();

    const filas = tiendas.map((t) => {
      const info = (guardado && guardado.tiendas && guardado.tiendas[t.id]) || null;
      const precio = leerPrecio(info);
      const disponible = !!(info && info.hay && precio !== null);
      return {
        tienda: t,
        precio: precio,
        hay: disponible,
        nota: (info && info.nota) || (info ? '' : sinDato(t, art, guardado)),
        nombreEnTienda: (info && info.nombre) || '',
        pasillo: (info && info.pasillo) || '',
        porUnidad: precio !== null ? D.textoPorUnidad(precio, art.contenido, art.unidad) : ''
      };
    });

    const compiten = filas.filter((f) => f.hay);
    compiten.sort((a, b) => a.precio - b.precio);
    const resto = filas.filter((f) => !f.hay);

    const mejor = compiten.length ? compiten[0] : null;
    const peor = compiten.length ? compiten[compiten.length - 1] : null;

    /* TODAS las tiendas que empatan en el precio más bajo, no solo la primera.

       Sin esto la app dice «más barato en Más x Menos» cuando la leche cuesta
       ₡1.050 en tres supermercados: da a entender que hay que ir a ese, y es
       falso. Un empate es una respuesta más útil que un ganador inventado,
       porque significa «este artículo no decide nada, míralo por los otros». */
    const mejores = mejor ? compiten.filter((f) => f.precio === mejor.precio) : [];

    return {
      articulo: art,
      consultadoEn: guardado ? guardado.consultadoEn : null,
      filas: compiten.concat(resto),
      mejor: mejor,
      mejores: mejores,
      /* El ahorro se mide contra el MÁS CARO, no contra la media: es la cifra
         que responde «¿cuánto me estoy ahorrando por no comprarlo en el peor
         sitio?», que es la decisión real. */
      ahorro: mejor && peor && peor.precio > mejor.precio ? peor.precio - mejor.precio : 0,
      empate: mejores.length > 1
    };
  }

  /* ---------- la lista entera --------------------------------------------------- */

  /* Un 'carro' por supermercado: lo que costaría comprar ahí toda la lista.

     Los que no tienen todo se apartan en 'incompletos' y llevan la lista de lo
     que les falta, con nombres y todo — decir «le faltan 3» sin decir cuáles
     obliga a ir a buscarlo a otra pantalla. */
  function carros(pendientes) {
    const tiendas = Store.tiendasActivas();

    const todos = tiendas.map((t) => {
      let total = 0;
      const faltan = [];
      const lleva = [];
      const aMano = [];

      pendientes.forEach((art) => {
        const cantidad = cuantos(art);

        /* Los de a mano entran en todos los carros por igual: suman lo mismo en
           los cinco, así que el orden no se mueve, y sin ellos el total no sería
           lo que se va a pagar. Nunca cuentan como «le falta». */
        if (art.libre) {
          const precio = precioAMano(art);
          if (precio !== null) total += precio * cantidad;
          aMano.push({ art, precio, cantidad, subtotal: precio === null ? null : precio * cantidad });
          return;
        }

        const guardado = Store.preciosDe(art.id);
        const info = guardado && guardado.tiendas ? guardado.tiendas[t.id] : null;
        const precio = leerPrecio(info);

        if (info && info.hay && precio !== null) {
          total += precio * cantidad;
          lleva.push({ art, precio, cantidad, subtotal: precio * cantidad });
        } else {
          faltan.push({ art, motivo: (info && info.nota) || 'sin consultar' });
        }
      });

      return { tienda: t, total, lleva, faltan, aMano, completo: faltan.length === 0 };
    });

    const completos = todos.filter((c) => c.completo && c.lleva.length)
      .sort((a, b) => a.total - b.total);
    const incompletos = todos.filter((c) => !c.completo || !c.lleva.length)
      .sort((a, b) => a.faltan.length - b.faltan.length || a.total - b.total);

    return { completos, incompletos, todos };
  }

  /* Toda la lista con los precios de UNA tienda, en el mismo orden que la lista
     de pendientes y sin saltarse nada.

     Los artículos que esa tienda no vende salen igualmente, con el motivo. Es lo
     que pidió Pablo y es lo correcto: una lista de la que han desaparecido tres
     renglones no se puede leer, porque no se sabe si faltan o si nunca
     estuvieron. */
  function filasDeTienda(pendientes, tiendaId) {
    return pendientes.map((art) => {
      const cantidad = cuantos(art);

      /* El de a mano sale en la lista de los cinco supermercados, marcado como
         tal. No lleva el gris de «no lo vende» porque no es cierto: no se le
         preguntó a nadie. */
      if (art.libre) {
        const p = precioAMano(art);
        return {
          art, cantidad, libre: true, precio: p, hay: p !== null,
          subtotal: p === null ? null : p * cantidad,
          nota: 'a mano'
        };
      }

      const guardado = Store.preciosDe(art.id);
      const info = guardado && guardado.tiendas ? guardado.tiendas[tiendaId] : null;
      const precio = leerPrecio(info);
      const hay = !!(info && info.hay && precio !== null);
      return {
        art, cantidad, precio, hay,
        subtotal: hay ? precio * cantidad : null,
        nota: (info && info.nota) || (info ? '' : sinDato({ id: tiendaId }, art, guardado))
      };
    });
  }

  /* Comprando cada cosa donde está más barata, sin importar cuántos súper haya
     que visitar. Es el suelo teórico: nadie va a hacer esto, pero es la única
     forma de saber CUÁNTO cuesta la comodidad de ir a un solo sitio.

     LOS EMPATES SE ASIGNAN A LA TIENDA QUE YA LLEVA MÁS COSAS, y esto importa
     más de lo que parece. La leche cuesta lo mismo en tres supermercados; si el
     empate se resolviera por el orden de la lista, un artículo se iría a una
     tienda a la que no había que ir por nada más, y el plan diría «ve a cuatro
     supermercados» cuando con dos bastaba. Se cuenta primero quién gana algo de
     verdad —sin empate— y los empatados se reparten después entre esos. */
  function repartido(pendientes) {
    const analisis = pendientes.map((art) => ({
      art,
      r: porArticulo(art),
      cantidad: cuantos(art)
    }));

    const votos = {};
    analisis.forEach(({ r }) => {
      if (r.mejores && r.mejores.length === 1) {
        const id = r.mejores[0].tienda.id;
        votos[id] = (votos[id] || 0) + 1;
      }
    });

    let total = 0;
    const porTienda = {};
    const sinPrecio = [];
    const aMano = [];

    analisis.forEach(({ art, r, cantidad }) => {
      /* Los de a mano no son una parada más: se compran donde sea. Van aparte,
         y su precio entra en el total —igual que entra en el de cada carro—
         para que las dos cifras se puedan restar sin trampa. */
      if (r.libre) {
        const p = r.precioManual;
        if (p !== null) total += p * cantidad;
        aMano.push({ art, precio: p, cantidad, subtotal: p === null ? null : p * cantidad });
        return;
      }

      if (!r.mejor) { sinPrecio.push(art); return; }

      const candidatas = (r.mejores && r.mejores.length) ? r.mejores : [r.mejor];
      const elegida = candidatas.reduce((mejor, f) =>
        (votos[f.tienda.id] || 0) > (votos[mejor.tienda.id] || 0) ? f : mejor, candidatas[0]);

      const subtotal = elegida.precio * cantidad;
      total += subtotal;

      const tid = elegida.tienda.id;
      if (!porTienda[tid]) porTienda[tid] = { tienda: elegida.tienda, items: [], total: 0 };
      porTienda[tid].items.push({ art, precio: elegida.precio, cantidad, subtotal });
      porTienda[tid].total += subtotal;
    });

    return {
      total,
      sinPrecio,
      aMano,
      paradas: Object.keys(porTienda).map((k) => porTienda[k]).sort((a, b) => b.total - a.total)
    };
  }

  /* El resumen que se enseña arriba del todo: la recomendación en una frase.

     La recomendación por defecto es SIEMPRE un solo supermercado. Repartir la
     compra solo se sugiere cuando el ahorro es de verdad, y el listón está
     puesto en dos condiciones a la vez (₡2.000 y 5 %) porque cada una sola
     falla: un 8 % de una lista de ₡3.000 son ₡240, y ₡2.000 sobre una compra
     de ₡90.000 no justifica un segundo viaje. */
  const AHORRO_MINIMO_COLONES = 2000;
  const AHORRO_MINIMO_PCT = 5;

  function recomendacion(pendientes) {
    const c = carros(pendientes);
    const r = repartido(pendientes);

    /* Si TODO lo pendiente es a mano no hay comparación posible, y hay que
       decirlo así. Sin esta salida los cinco carros quedan idénticos y la app
       recomendaría un supermercado al azar entre cinco empatados, con una
       seguridad que no tiene ningún fundamento. */
    if (!pendientes.some((a) => !a.libre)) {
      return { tipo: 'solo-a-mano', carros: c, repartido: r };
    }

    const mejorCarro = c.completos[0] || null;

    if (!mejorCarro) {
      return { tipo: 'incompleto', carros: c, repartido: r };
    }

    const ahorro = mejorCarro.total - r.total;
    const pct = D.porcentaje(ahorro, mejorCarro.total);
    const valeLaPena = r.paradas.length > 1 &&
      ahorro >= AHORRO_MINIMO_COLONES &&
      pct >= AHORRO_MINIMO_PCT;

    return {
      tipo: valeLaPena ? 'repartir' : 'una-tienda',
      mejorCarro,
      segundo: c.completos[1] || null,
      /* Cuánto se ahorra frente al segundo mejor: es lo que mide si la elección
         importa. Si el segundo está ₡200 detrás, da igual a cuál vayas. */
      ventaja: c.completos[1] ? c.completos[1].total - mejorCarro.total : 0,
      ahorroRepartiendo: ahorro,
      pctRepartiendo: pct,
      carros: c,
      repartido: r
    };
  }

  /* ---------- cuánto cuesta una lista con nombre --------------------------------- */

  /* Para la pantalla de «Otras listas»: cuánto costaría el queque, con los
     precios que ya se conocen.

     Se suma el precio MÁS BARATO de cada ingrediente, y se dice cuántos no
     tienen precio todavía. Un total al que le faltan tres ingredientes se
     quedaría corto sin avisar, y eso es peor que no dar ningún total. */
  function costeDeLista(contenido) {
    let total = 0;
    let sinPrecio = 0;

    contenido.forEach(({ articulo: art, cantidad }) => {
      const n = Math.max(1, Number(cantidad) || 1);
      const r = porArticulo(art);
      if (r.libre) {
        if (r.precioManual === null) sinPrecio++;
        else total += r.precioManual * n;
        return;
      }
      if (!r.mejor) { sinPrecio++; return; }
      total += r.mejor.precio * n;
    });

    return { total, sinPrecio, completo: sinPrecio === 0 && contenido.length > 0 };
  }

  /* ---------- de cuándo son estos precios -------------------------------------- */

  /* El precio más viejo de la lista manda: si uno se consultó hace una semana,
     el total de abajo no es de hoy por mucho que los otros catorce sí lo sean.
     Enseñar la fecha del más reciente sería tranquilizador y falso. */
  /* 'comparables' son los que sí se buscan en los supermercados. Hace falta
     aparte porque los de a mano no se consultan nunca: contarlos como «sin
     consultar» dejaría un aviso encendido para siempre que no se puede apagar
     haciendo nada. */
  function frescura(pendientes) {
    let masViejo = null;
    let sinConsultar = 0;
    let comparables = 0;
    pendientes.forEach((art) => {
      if (art.libre) return;
      comparables++;
      const g = Store.preciosDe(art.id);
      if (!g || !g.consultadoEn) { sinConsultar++; return; }
      if (!masViejo || g.consultadoEn < masViejo) masViejo = g.consultadoEn;
    });
    return { masViejo, sinConsultar, comparables };
  }

  global.Comparar = {
    porArticulo, carros, repartido, recomendacion, frescura, costeDeLista, filasDeTienda,
    precioAMano,
    AHORRO_MINIMO_COLONES, AHORRO_MINIMO_PCT
  };

})(window);
