/* ---------------------------------------------------------------------------
   views.js — Las pantallas.

   Dos reglas que vienen aprendidas de ControlGastos y que aquí también hay que
   respetar, porque romperlas no da error: simplemente la app se vuelve
   inservible en el móvil.

   1. NADA DE <datalist>. En Android Chrome se pinta como una lista a pantalla
      completa que tapa el teclado, y justo lo que hace falta teclear es lo que
      no está en la lista. Si hace falta sugerir, se pinta una lista propia.

   2. UNA LISTA QUE SE REPINTA A CADA TECLA NO PUEDE LLAMAR A App.render().
      Rehacer la pantalla en mitad de una palabra deja el campo sin foco y
      cierra el teclado. Se pinta a mano sobre el nodo. Y una tarjeta que lleva
      un campo dentro se construye UNA VEZ y devuelve un 'mostrar()' que repinta
      solo lo que cambia — si se reconstruye la tarjeta entera, el campo es un
      elemento nuevo en cada letra y pasa lo mismo aunque nadie haya llamado a
      render().
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const el = D.el;

  /* ---------- piezas sueltas -------------------------------------------------- */

  function header(titulo, sub) {
    return el('div.top', [
      el('div.top-text', [
        el('h1', { text: titulo }),
        sub ? el('p.sub', { text: sub }) : null
      ])
    ]);
  }

  function vacio(titulo, texto, accion) {
    return el('section.empty-state', [
      el('h2', { text: titulo }),
      el('p', { text: texto }),
      accion || null
    ]);
  }

  function aviso(texto, tono) {
    return el('p.aviso' + (tono ? '.aviso-' + tono : ''), { text: texto });
  }

  /* Chapa con el precio. La del más barato va en verde y el resto apagadas: si
     todo llevara color, el verde no significaría nada. */
  function chapaPrecio(precio, esMejor) {
    return el('span.precio' + (esMejor ? '.precio-mejor' : ''), { text: D.dinero(precio) });
  }

  function botonVolver(href, texto) {
    return el('a.back', { href: href, text: '‹ ' + texto });
  }

  /* ---------- borradores ------------------------------------------------------- */

  let borrador = null;
  function olvidarBorradores() { borrador = null; }
  function hayBorrador() { return !!(borrador && borrador.sucio); }

  /* ---------- adivinar el contenido del nombre ---------------------------------- */

  /* «Yogurt griego Dos Pinos arándanos - 750 ml» → 750 mL.

     Se adivina para no obligar a escribirlo, pero SIEMPRE queda a la vista y
     editable en la ficha: adivinar mal el contenido estropea el precio por
     unidad, que es justo la cifra en la que uno confía sin comprobar. */
  const EQUIVALE = {
    ml: 'mL', mls: 'mL', mililitro: 'mL', mililitros: 'mL',
    l: 'L', lt: 'L', lts: 'L', litro: 'L', litros: 'L',
    g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
    kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg',
    un: 'unidad', und: 'unidad', unid: 'unidad', unidad: 'unidad', unidades: 'unidad'
  };

  function adivinarContenido(nombre) {
    const texto = D.normal(nombre);
    const m = texto.match(/(\d+(?:[.,]\d+)?)\s*(ml|mls|mililitros?|lts?|litros?|l|kgs?|kilos?|kilogramos?|grs?|gramos?|g|unidades?|unid|und|un)\b/);
    if (!m) return null;
    const cantidad = Number(m[1].replace(',', '.'));
    const unidad = EQUIVALE[m[2]];
    if (!Number.isFinite(cantidad) || !unidad) return null;
    return { contenido: cantidad, unidad: unidad };
  }

  /* ===========================================================================
     MI LISTA — la pantalla del día a día
     =========================================================================== */

  function lista() {
    const pendientes = Store.pendientes();
    const caja = el('div');

    caja.appendChild(header('Mi lista',
      pendientes.length ? pendientes.length + (pendientes.length === 1 ? ' artículo por comprar' : ' artículos por comprar')
                        : 'Nada pendiente'));

    if (!Store.articulos().length) {
      caja.appendChild(vacio(
        'Todavía no hay nada en la despensa',
        'Agrega los artículos que compras normalmente. Después, cuando alguno se acabe en casa, lo marcas y la app te dice dónde comprarlo más barato.',
        el('a.btn.btn-primary', { href: '#/agregar', text: 'Agregar el primero' })
      ));
      return caja;
    }

    if (!pendientes.length) {
      caja.appendChild(vacio(
        'No falta nada',
        'Cuando algo se te acabe en casa, márcalo en la despensa y aparecerá aquí.',
        el('a.btn', { href: '#/despensa', text: 'Ir a la despensa' })
      ));
      return caja;
    }

    // --- la recomendación, arriba del todo -----------------------------------
    caja.appendChild(tarjetaRecomendacion(pendientes));

    // --- los artículos pendientes --------------------------------------------
    caja.appendChild(tarjetaPorComprar(pendientes));
    caja.appendChild(el('a.btn.btn-block', { href: '#/despensa', text: 'Agregar algo más' }));

    return caja;
  }

  /* Dos formas de ordenar la misma lista, y las dos sirven para algo distinto:

     - POR CATEGORÍA es la de hacer la compra: recorres la tienda por secciones
       —frutas primero, limpieza al final— en vez de cruzarla de un lado a otro.
       Por eso es la de fábrica, y por eso el orden de los grupos lo fija
       `CATEGORIAS_DE_FABRICA` y no el alfabeto.
     - ALFABÉTICO es la de buscar: «¿está el café en la lista?».

     Dentro de cada grupo el orden es alfabético igualmente, así que las dos
     vistas son estables: nada se mueve de sitio al marcar un artículo. */
  function tarjetaPorComprar(pendientes) {
    const modo = Store.ajustes().ordenLista === 'alfabetico' ? 'alfabetico' : 'categoria';

    const boton = (id, texto) => el('button.orden-btn' + (modo === id ? '.is-active' : ''), {
      type: 'button', text: texto,
      'aria-pressed': modo === id ? 'true' : 'false',
      onclick: () => { Store.guardarAjustes({ ordenLista: id }); App.render(); }
    });

    const tarjeta = el('section.card', [
      el('div.card-head', [
        el('h2.card-title', { text: 'Por comprar' }),
        el('div.orden', [boton('categoria', 'Por sección'), boton('alfabetico', 'A–Z')])
      ])
    ]);

    if (modo === 'alfabetico') {
      pendientes.forEach((art) => tarjeta.appendChild(filaPendiente(art, Comparar.porArticulo(art))));
      return tarjeta;
    }

    /* Se recorren las categorías en su orden y se saca solo las que tengan algo.
       Enseñar «Mascotas (0)» sería ocupar sitio para decir que no hay nada. */
    Store.categorias().forEach((cat) => {
      const dentro = pendientes.filter((a) => (a.categoria || 'otros') === cat.id);
      if (!dentro.length) return;
      tarjeta.appendChild(el('h3.grupo', { text: cat.nombre }));
      dentro.forEach((art) => tarjeta.appendChild(filaPendiente(art, Comparar.porArticulo(art))));
    });

    return tarjeta;
  }

  function filaPendiente(art, r) {
    const cantidad = Math.max(1, Number(art.cantidad) || 1);

    const menos = el('button.cant-btn', {
      type: 'button', text: '−', 'aria-label': 'Uno menos',
      onclick: () => { Store.ponerCantidad(art.id, cantidad - 1); App.render(); }
    });
    const mas = el('button.cant-btn', {
      type: 'button', text: '+', 'aria-label': 'Uno más',
      onclick: () => { Store.ponerCantidad(art.id, cantidad + 1); App.render(); }
    });

    return el('div.fila-pendiente', [
      el('div.fp-datos', [
        el('a.fp-nombre', { href: '#/articulo/' + art.id, text: art.nombre }),
        el('p.fp-precio', [textoMejor(r, cantidad)])
      ]),
      el('div.fp-cant', [
        menos,
        el('span.cant-num', { text: String(cantidad) }),
        mas
      ]),
      el('button.fp-listo', {
        type: 'button', text: '✓', 'aria-label': 'Ya lo compré',
        onclick: () => { Store.marcarPendiente(art.id, false); App.render(); }
      })
    ]);
  }

  /* «Más barato en Walmart: ₡2.700», o «₡1.050 en Más x Menos, Walmart y Maxi
     Palí» cuando empatan. Nombrar a uno solo en un empate hace creer que hay
     que ir a ese sitio, y no lo hay: el artículo no decide nada. */
  function textoMejor(r, cantidad) {
    if (!r.mejor) return el('span.muted', { text: 'Sin precios todavía' });

    const precio = chapaPrecio(r.mejor.precio * cantidad, true);

    if (!r.empate) {
      return el('span', ['Más barato en ', el('strong', { text: r.mejor.tienda.nombre }), ': ', precio]);
    }

    // Con más de tres nombres la frase se hace más larga que la fila.
    if (r.mejores.length > 3) {
      return el('span', ['Igual en ', el('strong', { text: r.mejores.length + ' supermercados' }), ': ', precio]);
    }

    const nombres = r.mejores.map((f) => f.tienda.nombre);
    const juntos = nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
    return el('span', ['Igual en ', el('strong', { text: juntos }), ': ', precio]);
  }

  /* La tarjeta de arriba: qué hacer, en una frase, y el botón para refrescar. */
  function tarjetaRecomendacion(pendientes) {
    const fr = Comparar.frescura(pendientes);
    const tarjeta = el('section.card.card-reco');

    if (!Store.configurado()) {
      tarjeta.appendChild(el('h2.card-title', { text: 'Falta conectar el intermediario' }));
      tarjeta.appendChild(el('p.muted', {
        text: 'Sin él la app no puede consultar precios: los supermercados no dejan que una página web les pregunte directamente.'
      }));
      tarjeta.appendChild(el('a.btn.btn-primary', { href: '#/ajustes', text: 'Ir a Ajustes' }));
      return tarjeta;
    }

    if (fr.sinConsultar === pendientes.length) {
      tarjeta.appendChild(el('h2.card-title', { text: 'Sin precios todavía' }));
      tarjeta.appendChild(el('p.muted', { text: 'Consulta los precios para saber a qué supermercado te conviene ir.' }));
      tarjeta.appendChild(botonActualizar(pendientes));
      return tarjeta;
    }

    const reco = Comparar.recomendacion(pendientes);

    if (reco.tipo === 'incompleto') {
      tarjeta.appendChild(el('h2.card-title', { text: 'Ningún supermercado tiene toda la lista' }));
      tarjeta.appendChild(el('p.muted', {
        text: 'Mira la comparación para ver a quién le falta qué y decidir.'
      }));
    } else {
      const c = reco.mejorCarro;
      tarjeta.appendChild(el('p.reco-eti', { text: 'Te conviene ir a' }));
      tarjeta.appendChild(el('p.reco-tienda', { text: c.tienda.nombre }));
      tarjeta.appendChild(el('p.reco-total', { text: D.dinero(c.total) }));

      if (reco.segundo && reco.ventaja > 0) {
        tarjeta.appendChild(el('p.hint', {
          text: 'Son ' + D.dinero(reco.ventaja) + ' menos que en ' + reco.segundo.tienda.nombre + '.'
        }));
      } else if (reco.segundo) {
        tarjeta.appendChild(el('p.hint', {
          text: 'Empatado con ' + reco.segundo.tienda.nombre + ': da igual a cuál vayas.'
        }));
      } else {
        /* Gana por ser el único que tiene todo, no por ser el más barato. Sin
           decirlo, la cifra parece el resultado de una comparación que en
           realidad no hubo. */
        tarjeta.appendChild(el('p.hint', {
          text: 'Es el único supermercado que tiene toda la lista.'
        }));
      }

      if (reco.tipo === 'repartir') {
        tarjeta.appendChild(el('p.hint-box', {
          text: 'Repartiendo la compra entre ' + reco.repartido.paradas.length +
                ' supermercados te ahorrarías ' + D.dinero(reco.ahorroRepartiendo) +
                ' más (' + reco.pctRepartiendo + '%).'
        }));
      }
    }

    if (fr.masViejo) {
      tarjeta.appendChild(el('p.ref', { text: 'Precios consultados ' + D.desdeEntonces(fr.masViejo) + '.' }));
    }
    if (fr.sinConsultar) {
      tarjeta.appendChild(aviso(fr.sinConsultar + (fr.sinConsultar === 1
        ? ' artículo no se ha consultado nunca.'
        : ' artículos no se han consultado nunca.'), 'ojo'));
    }

    tarjeta.appendChild(el('div.form-actions', [
      el('a.btn', { href: '#/comparar', text: 'Ver comparación' }),
      botonActualizar(pendientes)
    ]));

    return tarjeta;
  }

  /* El botón se deshabilita y cuenta lo que está haciendo. Una consulta a cinco
     supermercados tarda unos segundos y sin aviso parece que no pasó nada, así
     que se toca dos veces y se duplica el trabajo. */
  function botonActualizar(pendientes) {
    const boton = el('button.btn.btn-primary', { type: 'button', text: 'Consultar precios' });
    boton.addEventListener('click', async () => {
      boton.disabled = true;
      boton.textContent = 'Consultando…';
      try {
        await Precios.consultar(pendientes);
        App.render();
      } catch (err) {
        boton.disabled = false;
        boton.textContent = 'Consultar precios';
        alert(err.message);
      }
    });
    return boton;
  }

  /* ===========================================================================
     DESPENSA — todo lo que compras normalmente
     =========================================================================== */

  function despensa() {
    const caja = el('div');
    caja.appendChild(header('Despensa', 'Lo que compras normalmente'));
    caja.appendChild(el('a.btn.btn-primary.btn-block', { href: '#/agregar', text: '+ Agregar artículo' }));

    const todos = Store.articulos();
    if (!todos.length) {
      caja.appendChild(vacio('La despensa está vacía',
        'Agrega los artículos que compras normalmente y quédatelos guardados: solo hay que hacerlo una vez por artículo.'));
      return caja;
    }

    /* La tarjeta con el buscador se construye UNA VEZ y repinta solo la lista.
       Ver la regla 2 de la cabecera del archivo. */
    caja.appendChild(tarjetaDespensa(todos));
    return caja;
  }

  function tarjetaDespensa(todos) {
    const listaNodo = el('div.lista-articulos');

    const campo = el('input.buscador', {
      type: 'search',
      placeholder: 'Buscar en la despensa',
      'aria-label': 'Buscar en la despensa'
    });

    campo.addEventListener('input', () => mostrar(campo.value));

    function mostrar(filtro) {
      const f = D.normal(filtro);
      const visibles = f
        ? todos.filter((a) => D.normal(a.nombre + ' ' + a.marca).indexOf(f) >= 0)
        : todos;

      D.clear(listaNodo);

      if (!visibles.length) {
        listaNodo.appendChild(el('p.muted', { text: 'Nada coincide con «' + filtro + '».' }));
        return;
      }
      visibles.forEach((art) => listaNodo.appendChild(filaDespensa(art)));
    }

    mostrar('');

    return el('section.card', [
      el('div.card-head', [
        el('h2.card-title', { text: 'Artículos' }),
        el('span.ref', { text: String(todos.length) })
      ]),
      campo,
      listaNodo
    ]);
  }

  function filaDespensa(art) {
    const boton = art.pendiente
      ? el('button.btn.btn-small.btn-ya', {
          type: 'button', text: 'En la lista',
          onclick: () => { Store.marcarPendiente(art.id, false); App.render(); }
        })
      : el('button.btn.btn-small', {
          type: 'button', text: 'Se acabó',
          onclick: () => { Store.marcarPendiente(art.id, true); App.render(); }
        });

    const detalles = [Store.nombreDeCategoria(art.categoria)];
    if (art.marca) detalles.push(art.marca);
    if (art.contenido) detalles.push(art.contenido + ' ' + art.unidad);
    if (!art.amId) detalles.push('sin Auto Mercado');

    return el('div.fila-art', [
      el('a.fa-datos', { href: '#/articulo/' + art.id }, [
        el('span.fa-nombre', { text: art.nombre }),
        detalles.length ? el('span.fa-sub', { text: detalles.join(' · ') }) : null
      ]),
      boton
    ]);
  }

  /* ===========================================================================
     AGREGAR — buscar en los supermercados y guardar el artículo
     =========================================================================== */

  /* El emparejamiento con Auto Mercado se hace aquí, en el mismo momento, y no
     más tarde en una pantalla de «pendientes de emparejar». Es un toque, y
     hacerlo ahora es la diferencia entre un artículo terminado y una tarea que
     se acumula. */

  /* `listaId` viene puesto cuando se llega desde una lista con nombre. En ese
     caso el artículo entra en la despensa Y en esa lista, y se vuelve allí. Sin
     esto habría que agregarlo, volver a mano y buscarlo otra vez. */
  function agregar(listaId) {
    const lista = listaId ? Store.listaDe(listaId) : null;
    const caja = el('div');

    caja.appendChild(lista
      ? botonVolver('#/listas/' + lista.id, lista.nombre)
      : botonVolver('#/despensa', 'Despensa'));

    caja.appendChild(header('Agregar artículo',
      lista ? 'Se guardará en la despensa y en «' + lista.nombre + '»' : 'Búscalo por su nombre'));

    if (!Store.configurado()) {
      caja.appendChild(vacio('Falta conectar el intermediario',
        'Sin él no se puede buscar en los supermercados.',
        el('a.btn.btn-primary', { href: '#/ajustes', text: 'Ir a Ajustes' })));
      return caja;
    }

    const resultados = el('div.resultados');

    const campo = el('input', {
      type: 'search',
      placeholder: 'yogurt griego arándano',
      'aria-label': 'Qué buscar'
    });

    const boton = el('button.btn.btn-primary', { type: 'submit', text: 'Buscar' });

    const formulario = el('form.buscar-form', [campo, boton]);

    formulario.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = campo.value.trim();
      if (q.length < 3) { alert('Escribe al menos 3 letras.'); return; }

      boton.disabled = true;
      boton.textContent = 'Buscando…';
      D.clear(resultados);
      resultados.appendChild(el('p.muted', { text: 'Buscando en los supermercados…' }));

      try {
        const r = await Precios.buscar(q);
        D.clear(resultados);
        pintarResultados(resultados, r, listaId);
      } catch (err) {
        D.clear(resultados);
        resultados.appendChild(aviso(err.message, 'malo'));
      } finally {
        boton.disabled = false;
        boton.textContent = 'Buscar';
      }
    });

    caja.appendChild(el('section.card', [formulario, resultados]));
    return caja;
  }

  function pintarResultados(nodo, r, listaId) {
    if (!r.conCodigo.length) {
      nodo.appendChild(el('p.muted', {
        text: 'No se encontró nada. Prueba con menos palabras: «yogurt griego» en vez de la marca y el sabor completos.'
      }));
      return;
    }

    nodo.appendChild(el('p.hint', { text: 'Toca el que sea. Se guardará con su código de barras, que es lo que permite encontrarlo después en los demás supermercados.' }));

    r.conCodigo.forEach((p) => {
      const yaEsta = Store.porEan(p.ean);

      /* Un artículo que ya está en la despensa no se puede volver a crear, pero
         SÍ puede entrar en la lista a la que se venía. Deshabilitar la fila sin
         más dejaba en un callejón sin salida: la canela ya estaba en la
         despensa y no había forma de meterla en el queque desde aquí. */
      if (yaEsta && listaId) {
        nodo.appendChild(el('button.res-fila', {
          type: 'button',
          onclick: () => { Store.agregarALista(listaId, yaEsta.id, 1); location.hash = '#/listas/' + listaId; }
        }, [
          el('span.res-nombre', { text: p.nombre }),
          el('span.res-sub', { text: 'Ya en tu despensa · tocar para agregarlo a la lista' })
        ]));
        return;
      }

      nodo.appendChild(el('button.res-fila', {
        type: 'button',
        disabled: !!yaEsta,
        onclick: () => elegido(p, listaId)
      }, [
        el('span.res-nombre', { text: p.nombre }),
        el('span.res-sub', { text: yaEsta ? 'Ya está en tu despensa' : (p.marca || '') })
      ]));
    });
  }

  /* Al elegir el artículo se guarda de una vez —para que no se pierda si algo
     sale mal después— y acto seguido se ofrece emparejar Auto Mercado. */
  function elegido(producto, listaId) {
    const adivinado = adivinarContenido(producto.nombre) || {};
    const art = Store.guardarArticulo({
      nombre:    producto.nombre,
      ean:       producto.ean,
      marca:     producto.marca,
      imagen:    producto.imagen,
      contenido: adivinado.contenido || null,
      unidad:    adivinado.unidad || 'unidad',
      categoria: Store.adivinarCategoria(producto.nombre)
    });

    if (listaId) {
      Store.agregarALista(listaId, art.id, 1);
      location.hash = '#/listas/' + listaId;
      return;
    }

    location.hash = '#/articulo/' + art.id + '/nuevo';
  }

  /* ===========================================================================
     OTRAS LISTAS — «Queque de manzana» y compañía
     ===========================================================================

     Una lista con nombre no guarda artículos propios: apunta a los de la
     despensa. Ver la explicación larga en store.js. La consecuencia visible es
     que un ingrediente se agrega buscándolo en la despensa, y si no está, se
     agrega a la despensa primero —y desde aquí mismo, sin perder el hilo—.
     =========================================================================== */

  function listas() {
    const todas = Store.listas();
    const caja = el('div');

    caja.appendChild(header('Otras listas', 'Compras que se repiten con nombre propio'));

    caja.appendChild(el('button.btn.btn-primary.btn-block', {
      type: 'button', text: '+ Nueva lista',
      onclick: () => {
        const nombre = prompt('¿Cómo se llama la lista?\n\nPor ejemplo: Queque de manzana');
        if (!nombre || !nombre.trim()) return;
        const l = Store.guardarLista({ nombre: nombre.trim(), items: [] });
        location.hash = '#/listas/' + l.id;
      }
    }));

    if (!todas.length) {
      caja.appendChild(vacio('Todavía no hay ninguna',
        'Sirven para lo que compras junto: los ingredientes de un queque, lo de una fiesta, lo del viaje. Se arman una vez y después se vuelcan en la compra de un toque.'));
      return caja;
    }

    const tarjeta = el('section.card', [el('h2.card-title', { text: 'Tus listas' })]);

    todas.forEach((l) => {
      const contenido = Store.articulosDeLista(l.id);
      const coste = Comparar.costeDeLista(contenido);

      let sub;
      if (!contenido.length) sub = 'vacía';
      else if (coste.completo) sub = contenido.length + (contenido.length === 1 ? ' artículo · ' : ' artículos · ') + D.dinero(coste.total);
      else if (coste.sinPrecio === contenido.length) sub = contenido.length + ' artículos · sin precios';
      else sub = contenido.length + ' artículos · desde ' + D.dinero(coste.total);

      tarjeta.appendChild(el('a.fila-art', { href: '#/listas/' + l.id }, [
        el('span.fa-datos', [
          el('span.fa-nombre', { text: l.nombre }),
          el('span.fa-sub', { text: sub })
        ]),
        el('span.fa-flecha', { text: '›' })
      ]));
    });

    caja.appendChild(tarjeta);
    return caja;
  }

  function listaDetalle(id) {
    const lista = Store.listaDe(id);
    const caja = el('div');

    if (!lista) {
      caja.appendChild(vacio('Esa lista ya no está', 'Puede que la hayas borrado.',
        el('a.btn', { href: '#/listas', text: 'Volver a las listas' })));
      return caja;
    }

    const contenido = Store.articulosDeLista(id);
    const coste = Comparar.costeDeLista(contenido);

    caja.appendChild(botonVolver('#/listas', 'Otras listas'));
    caja.appendChild(header(lista.nombre,
      contenido.length ? contenido.length + (contenido.length === 1 ? ' artículo' : ' artículos') : 'Vacía'));

    // --- cuánto cuesta y el botón de volcarla -------------------------------
    if (contenido.length) {
      const tarjeta = el('section.card.card-reco');
      tarjeta.appendChild(el('p.reco-eti', { text: coste.completo ? 'Cuesta' : 'Cuesta al menos' }));
      tarjeta.appendChild(el('p.reco-total', { text: D.dinero(coste.total) }));
      tarjeta.appendChild(el('p.hint', {
        text: 'Sumando el precio más barato de cada ingrediente, sin importar el supermercado.'
      }));
      if (coste.sinPrecio) {
        tarjeta.appendChild(aviso(coste.sinPrecio === 1
          ? 'Falta el precio de 1 ingrediente, así que el total se queda corto.'
          : 'Faltan los precios de ' + coste.sinPrecio + ' ingredientes, así que el total se queda corto.', 'ojo'));
      }
      tarjeta.appendChild(el('button.btn.btn-primary', {
        type: 'button', text: 'Agregar todo a mi lista',
        onclick: () => {
          const r = Store.verterEnLaCompra(id);
          /* Se dice qué pasó en vez de saltar a la lista sin más: si a tres
             artículos se les sumó cantidad, eso hay que contarlo o parecerá que
             la app cambió números por su cuenta. */
          const partes = [];
          if (r.nuevos) {
            partes.push(r.nuevos + (r.nuevos === 1 ? ' artículo agregado' : ' artículos agregados') + ' a tu lista.');
          }
          if (r.sumados) {
            partes.push(r.sumados === 1
              ? 'A 1 artículo que ya estaba se le sumó la cantidad.'
              : 'A ' + r.sumados + ' artículos que ya estaban se les sumó la cantidad.');
          }
          alert(partes.join('\n\n'));
          location.hash = '#/lista';
        }
      }));
      caja.appendChild(tarjeta);
    }

    // --- los ingredientes ----------------------------------------------------
    if (contenido.length) {
      const tarjeta = el('section.card', [el('h2.card-title', { text: 'Ingredientes' })]);
      contenido.forEach(({ articulo: art, cantidad }) => {
        tarjeta.appendChild(filaIngrediente(lista, art, cantidad));
      });
      caja.appendChild(tarjeta);
    }

    // --- agregar ingredientes -------------------------------------------------
    caja.appendChild(tarjetaAgregarIngrediente(lista));

    // --- renombrar y borrar ---------------------------------------------------
    caja.appendChild(el('section.card', [
      el('h2.card-title', { text: 'La lista' }),
      el('button.btn', {
        type: 'button', text: 'Cambiarle el nombre',
        onclick: () => {
          const nombre = prompt('Nuevo nombre:', lista.nombre);
          if (!nombre || !nombre.trim()) return;
          Store.guardarLista(Object.assign({}, lista, { nombre: nombre.trim() }));
          App.render();
        }
      }),
      el('button.btn.btn-danger', {
        type: 'button', text: 'Borrar la lista',
        onclick: () => {
          if (!confirm('¿Borrar «' + lista.nombre + '»?\n\nLos artículos se quedan en la despensa: solo se borra la lista.')) return;
          Store.borrarLista(lista.id);
          location.hash = '#/listas';
        }
      }),
      el('p.hint', { text: 'Borrar la lista no borra ningún artículo de la despensa.' })
    ]));

    return caja;
  }

  function filaIngrediente(lista, art, cantidad) {
    const r = Comparar.porArticulo(art);

    return el('div.fila-pendiente', [
      el('div.fp-datos', [
        el('a.fp-nombre', { href: '#/articulo/' + art.id, text: art.nombre }),
        el('p.fp-precio', [
          r.mejor
            ? el('span', { text: D.dinero(r.mejor.precio * cantidad) + ' · ' + r.mejor.tienda.nombre })
            : el('span.muted', { text: 'Sin precio todavía' })
        ])
      ]),
      el('div.fp-cant', [
        el('button.cant-btn', {
          type: 'button', text: '−', 'aria-label': 'Uno menos',
          onclick: () => { Store.cantidadEnLista(lista.id, art.id, cantidad - 1); App.render(); }
        }),
        el('span.cant-num', { text: String(cantidad) }),
        el('button.cant-btn', {
          type: 'button', text: '+', 'aria-label': 'Uno más',
          onclick: () => { Store.cantidadEnLista(lista.id, art.id, cantidad + 1); App.render(); }
        })
      ]),
      el('button.fp-quitar', {
        type: 'button', text: '×', 'aria-label': 'Quitar de la lista',
        onclick: () => { Store.quitarDeLista(lista.id, art.id); App.render(); }
      })
    ]);
  }

  /* El buscador se construye UNA VEZ y repinta solo su lista. Si se
     reconstruyera la tarjeta entera en cada tecla, el campo sería un elemento
     nuevo cada letra y en el móvil se cerraría el teclado. Es la regla 2 de la
     cabecera del archivo, y la misma máquina que `tarjetaDespensa`. */
  function tarjetaAgregarIngrediente(lista) {
    const yaEstan = {};
    lista.items.forEach((it) => { yaEstan[it.art] = true; });

    const disponibles = Store.articulos();
    const resultados = el('div.lista-articulos');

    const campo = el('input.buscador', {
      type: 'search',
      placeholder: 'Buscar en la despensa',
      'aria-label': 'Buscar un ingrediente en la despensa'
    });

    campo.addEventListener('input', () => mostrar(campo.value));

    function mostrar(filtro) {
      const f = D.normal(filtro);
      D.clear(resultados);

      /* Sin escribir nada no se vuelca la despensa entera: con cincuenta
         artículos la tarjeta sería más larga que la propia lista y habría que
         hacer scroll para llegar a lo de abajo. */
      if (!f) {
        resultados.appendChild(el('p.hint', { text: 'Escribe para buscar entre tus ' + disponibles.length + ' artículos.' }));
        return;
      }

      const visibles = disponibles
        .filter((a) => D.normal(a.nombre + ' ' + a.marca).indexOf(f) >= 0)
        .slice(0, 8);

      if (!visibles.length) {
        resultados.appendChild(el('p.muted', { text: 'Nada coincide. Si no lo tienes en la despensa, agrégalo con el botón de abajo.' }));
        return;
      }

      visibles.forEach((art) => {
        const dentro = yaEstan[art.id];
        resultados.appendChild(el('div.fila-art', [
          el('span.fa-datos', [
            el('span.fa-nombre', { text: art.nombre }),
            art.marca ? el('span.fa-sub', { text: art.marca }) : null
          ]),
          dentro
            ? el('span.ref', { text: 'ya está' })
            : el('button.btn.btn-small', {
                type: 'button', text: 'Agregar',
                onclick: () => { Store.agregarALista(lista.id, art.id, 1); App.render(); }
              })
        ]));
      });
    }

    mostrar('');

    return el('section.card', [
      el('h2.card-title', { text: 'Agregar ingredientes' }),
      campo,
      resultados,
      el('a.btn.btn-block', {
        href: '#/agregar/lista/' + lista.id,
        text: 'Buscarlo en los supermercados'
      }),
      el('p.hint', { text: 'Si el ingrediente no está todavía en tu despensa, búscalo ahí: se guarda en la despensa y entra en esta lista de una vez.' })
    ]);
  }

  /* ===========================================================================
     FICHA DEL ARTÍCULO
     =========================================================================== */

  function articuloDetalle(id, recienCreado) {
    const art = Store.articulo(id);
    const caja = el('div');

    if (!art) {
      caja.appendChild(vacio('Ese artículo ya no está', 'Puede que lo hayas borrado.',
        el('a.btn', { href: '#/despensa', text: 'Volver a la despensa' })));
      return caja;
    }

    caja.appendChild(botonVolver('#/despensa', 'Despensa'));
    caja.appendChild(header(art.nombre, [art.marca, art.contenido ? art.contenido + ' ' + art.unidad : null]
      .filter(Boolean).join(' · ') || null));

    if (recienCreado) {
      caja.appendChild(el('p.hint-box', {
        text: 'Guardado. Ya se puede consultar en Más x Menos, Walmart, Maxi Palí y Megasuper con su código de barras.'
      }));
    }

    caja.appendChild(tarjetaAutoMercado(art));
    caja.appendChild(tarjetaPreciosArticulo(art));
    caja.appendChild(tarjetaDatosArticulo(art));
    caja.appendChild(tarjetaHistorico(art));
    caja.appendChild(tarjetaBorrar(art));

    return caja;
  }

  /* Auto Mercado, en su propia tarjeta y explicando por qué es distinto. Sin la
     explicación parece un fallo de la app; con ella es una particularidad
     entendible de ese supermercado. */
  function tarjetaAutoMercado(art) {
    const tarjeta = el('section.card');
    tarjeta.appendChild(el('h2.card-title', { text: 'Auto Mercado' }));

    if (art.amId) {
      tarjeta.appendChild(el('p.muted', { text: 'Emparejado. Su precio se actualiza solo con los demás.' }));
      tarjeta.appendChild(el('button.link-danger', {
        type: 'button', text: 'Deshacer el emparejamiento',
        onclick: () => {
          Store.guardarArticulo(Object.assign({}, art, { amId: '' }));
          App.render();
        }
      }));
      return tarjeta;
    }

    tarjeta.appendChild(el('p.muted', {
      text: 'Auto Mercado no publica el código de barras, así que hay que decirle a la app cuál es este artículo en su catálogo. Es un toque y se hace una sola vez.'
    }));

    const resultados = el('div.resultados');

    /* EL CAMPO SE PUEDE EDITAR, y no es un adorno.

       Los dos supermercados nombran el mismo producto distinto —«Arroz Tío
       Pelón 99% grano entero» contra «ARROZ BLANCO 99% TIO PELON»— y el
       buscador de Auto Mercado exige todas las palabras. Con el nombre completo
       hay artículos que devuelven cero y parece que no los vende.

       La app manda además una consulta corta de respaldo (ver `consultaCorta`),
       que rescata la mayoría de esos casos sola. Pero cuando ni así aparece, la
       única salida es poder escribirlo a mano: un botón que busca siempre lo
       mismo deja en un callejón sin salida. */
    const campo = el('input', {
      type: 'search',
      value: art.nombre,
      'aria-label': 'Qué buscar en Auto Mercado'
    });

    const boton = el('button.btn', { type: 'button', text: 'Buscar en Auto Mercado' });

    boton.addEventListener('click', async () => {
      const texto = campo.value.trim();
      if (texto.length < 3) { alert('Escribe al menos 3 letras.'); return; }

      boton.disabled = true;
      boton.textContent = 'Buscando…';
      D.clear(resultados);
      try {
        const r = await Precios.buscar(texto, consultaCorta(art));
        D.clear(resultados);

        if (!r.autoMercado.length) {
          resultados.appendChild(el('p.muted', {
            text: 'No apareció nada. Prueba con menos palabras —solo el producto y la marca, por ejemplo «arroz tío pelón»—, o déjalo sin emparejar: se comparará entre los otros cuatro.'
          }));
          return;
        }

        if (r.amConRespaldo) {
          resultados.appendChild(el('p.hint-box', {
            text: 'Con el nombre completo no aparecía nada, así que se buscó «' + r.amConsulta +
                  '». Los resultados son más amplios: fíjate bien en la presentación antes de elegir.'
          }));
        }

        r.autoMercado.forEach((p) => {
          resultados.appendChild(el('button.res-fila', {
            type: 'button',
            onclick: () => {
              Store.guardarArticulo(Object.assign({}, art, { amId: p.amId }));
              App.render();
            }
          }, [
            el('span.res-nombre', { text: p.nombre }),
            el('span.res-sub', { text: p.presentacion || '' })
          ]));
        });
      } catch (err) {
        D.clear(resultados);
        resultados.appendChild(aviso(err.message, 'malo'));
      } finally {
        boton.disabled = false;
        boton.textContent = 'Buscar en Auto Mercado';
      }
    });

    tarjeta.appendChild(el('label.campo', [el('span', { text: 'Buscar' }), campo]));
    tarjeta.appendChild(boton);
    tarjeta.appendChild(resultados);
    return tarjeta;
  }

  /* La consulta de respaldo: la primera palabra del nombre (que casi siempre es
     de qué producto se trata: «Arroz», «Leche», «Café»), la marca y el tamaño.

     Se queda corta a propósito. El nombre completo ordena mejor los resultados
     CUANDO encuentra algo, así que esta solo se usa si aquella devuelve cero:
     comprobado que «Leche DOS PINOS 1 L» pone de primero un «LECHE COMPLEMENTO
     CRE-C» que no es, mientras que el nombre completo acierta. */
  function consultaCorta(art) {
    const partes = [];
    const primera = String(art.nombre || '').trim().split(/\s+/)[0];
    if (primera) partes.push(primera);
    if (art.marca) partes.push(art.marca);
    if (art.contenido) partes.push(art.contenido + ' ' + art.unidad);
    const texto = partes.join(' ').trim();
    return texto.length >= 3 ? texto : '';
  }

  function tarjetaPreciosArticulo(art) {
    const r = Comparar.porArticulo(art);
    const tarjeta = el('section.card', [
      el('div.card-head', [
        el('h2.card-title', { text: 'Precios' }),
        r.consultadoEn ? el('span.ref', { text: D.desdeEntonces(r.consultadoEn) }) : null
      ])
    ]);

    if (!r.consultadoEn) {
      tarjeta.appendChild(el('p.muted', { text: 'Todavía no se ha consultado.' }));
    } else {
      r.filas.forEach((f) => {
        const esMejor = r.mejor && f.tienda.id === r.mejor.tienda.id && !r.empate;
        tarjeta.appendChild(el('div.fila-precio' + (esMejor ? '.es-mejor' : ''), [
          el('span.fp-tienda', { text: f.tienda.nombre }),
          el('span.fp-unidad', { text: f.porUnidad }),
          f.hay ? chapaPrecio(f.precio, esMejor) : el('span.precio-no', { text: f.nota || 'no lo vende' })
        ]));
      });

      if (r.ahorro > 0) {
        tarjeta.appendChild(el('p.hint', {
          text: 'Entre el más barato y el más caro hay ' + D.dinero(r.ahorro) + '.'
        }));
      }
    }

    const boton = el('button.btn.btn-block', { type: 'button', text: 'Consultar ahora' });
    boton.addEventListener('click', async () => {
      boton.disabled = true;
      boton.textContent = 'Consultando…';
      try { await Precios.consultar([art]); App.render(); }
      catch (err) { boton.disabled = false; boton.textContent = 'Consultar ahora'; alert(err.message); }
    });
    tarjeta.appendChild(boton);

    return tarjeta;
  }

  /* El contenido se puede corregir, y tiene que poder corregirse: se adivina del
     nombre y una adivinanza mala estropea el precio por unidad en silencio. */
  function tarjetaDatosArticulo(art) {
    const nombre = el('input', { type: 'text', value: art.nombre, 'aria-label': 'Nombre' });
    const contenido = el('input', {
      type: 'number', min: '0', step: 'any',
      value: art.contenido || '', placeholder: '750', 'aria-label': 'Contenido'
    });
    const unidad = el('select', { 'aria-label': 'Unidad' },
      Store.UNIDADES.map((u) => el('option', { value: u.id, selected: u.id === art.unidad, text: u.nombre })));

    const categoria = el('select', { 'aria-label': 'Categoría' },
      Store.categorias().map((c) =>
        el('option', { value: c.id, selected: c.id === (art.categoria || 'otros'), text: c.nombre })));

    const guardar = el('button.btn', {
      type: 'button', text: 'Guardar cambios',
      onclick: () => {
        const n = nombre.value.trim();
        if (!n) { alert('El nombre no puede quedar vacío.'); return; }
        Store.guardarArticulo(Object.assign({}, art, {
          nombre: n,
          contenido: contenido.value ? Number(contenido.value) : null,
          unidad: unidad.value,
          categoria: categoria.value
        }));
        App.render();
      }
    });

    return el('section.card', [
      el('h2.card-title', { text: 'Datos' }),
      el('label.campo', [el('span', { text: 'Nombre' }), nombre]),
      el('label.campo', [el('span', { text: 'Categoría' }), categoria]),
      el('p.hint', { text: 'La categoría la adivina la app por el nombre, y agrupa la lista por secciones del súper. Si se equivocó, cámbiala aquí.' }),
      el('div.campo-doble', [
        el('label.campo', [el('span', { text: 'Contenido' }), contenido]),
        el('label.campo', [el('span', { text: 'Unidad' }), unidad])
      ]),
      el('p.hint', { text: 'El contenido sirve para el precio por litro o por kilo. Si está mal, esa comparación miente.' }),
      art.ean ? el('p.ref', { text: 'Código de barras: ' + art.ean }) : null,
      guardar
    ]);
  }

  function tarjetaHistorico(art) {
    const tarjeta = el('section.card');
    tarjeta.appendChild(el('h2.card-title', { text: 'Cómo ha cambiado' }));

    const tiendas = Store.tiendasActivas();
    let algo = false;

    tiendas.forEach((t) => {
      const v = Store.variacion(art.id, t.id);
      if (!v) return;
      algo = true;
      const signo = v.pct > 0 ? '+' : '';
      const tono = v.pct > 0 ? 'sube' : (v.pct < 0 ? 'baja' : '');
      tarjeta.appendChild(el('div.fila-hist', [
        el('span.fh-tienda', { text: t.nombre }),
        el('span.fh-rango', { text: D.dinero(v.desde) + ' → ' + D.dinero(v.hasta) }),
        el('span.fh-pct' + (tono ? '.fh-' + tono : ''), { text: signo + v.pct + '%' })
      ]));
    });

    if (!algo) {
      tarjeta.appendChild(el('p.muted', {
        text: 'Todavía no hay con qué comparar. Aquí van a ir apareciendo las veces que cambie el precio.'
      }));
    }
    return tarjeta;
  }

  function tarjetaBorrar(art) {
    return el('section.card', [
      el('h2.card-title', { text: 'Quitar de la despensa' }),
      el('p.muted', { text: 'Se borra el artículo y su histórico de precios. No se puede deshacer.' }),
      el('button.btn.btn-danger', {
        type: 'button', text: 'Quitar «' + art.nombre + '»',
        onclick: () => {
          if (!confirm('¿Quitar «' + art.nombre + '» y su histórico de precios?')) return;
          Store.borrarArticulo(art.id);
          location.hash = '#/despensa';
        }
      })
    ]);
  }

  /* ===========================================================================
     COMPARAR — la tabla completa
     =========================================================================== */

  function comparar() {
    const pendientes = Store.pendientes();
    const caja = el('div');
    caja.appendChild(botonVolver('#/lista', 'Mi lista'));
    caja.appendChild(header('Comparación', pendientes.length + ' artículos'));

    if (!pendientes.length) {
      caja.appendChild(vacio('No hay nada que comparar', 'Marca en la despensa lo que se te haya acabado.'));
      return caja;
    }

    const reco = Comparar.recomendacion(pendientes);

    /* UN SOLO acordeón para las dos tarjetas, no uno por tarjeta.

       Con uno por tarjeta podían quedar dos supermercados abiertos a la vez
       —uno de «la lista completa» y otro de «no tienen todo»— y la pantalla se
       hacía larguísima justo cuando estás comparando dos cifras que ya no caben
       juntas. Se abre uno cada vez. */
    const acordeon = [];

    // --- los carros completos -------------------------------------------------
    if (reco.carros.completos.length) {
      const tarjeta = el('section.card', [
        el('h2.card-title', { text: 'La lista completa, súper por súper' }),
        el('p.hint', { text: 'Toca un supermercado para ver tu lista con sus precios.' })
      ]);
      reco.carros.completos.forEach((c, i) => {
        agregarCarroDesplegable(tarjeta, acordeon, pendientes, c, { mejor: i === 0 });
      });
      caja.appendChild(tarjeta);
    }

    // --- los que no tienen todo ------------------------------------------------
    if (reco.carros.incompletos.length) {
      const tarjeta = el('section.card', [
        el('h2.card-title', { text: 'No tienen toda la lista' }),
        el('p.hint', { text: 'Su total no se compara con los de arriba: sería más barato solo por venderte menos cosas. Tócalos para ver qué les falta.' })
      ]);
      reco.carros.incompletos.forEach((c) => {
        agregarCarroDesplegable(tarjeta, acordeon, pendientes, c, { parcial: true });
      });
      caja.appendChild(tarjeta);
    }

    // --- lo más barato de cada supermercado -------------------------------------
    caja.appendChild(tarjetaLoMasBarato(reco));

    return caja;
  }

  /* Una fila de supermercado que se despliega con toda la lista y sus precios.

     Se construye la fila Y su detalle de una vez, y el clic solo enciende y
     apaga el detalle: NO se llama a App.render(). Rehacer la pantalla haría
     saltar el scroll justo cuando estás comparando, que es cuando más molesta.

     Funciona en acordeón —abrir uno cierra los demás— porque con cinco
     supermercados y quince artículos, tenerlos todos abiertos convierte la
     pantalla en un rollo de varios metros. */
  function agregarCarroDesplegable(tarjeta, acordeon, pendientes, carro, opciones) {
    const detalle = el('div.carro-detalle', { hidden: true });

    Comparar.filasDeTienda(pendientes, carro.tienda.id).forEach((f) => {
      detalle.appendChild(el('div.cd-fila' + (f.hay ? '' : '.cd-no'), [
        el('span.cd-nombre', {
          text: f.art.nombre + (f.cantidad > 1 ? '  ×' + f.cantidad : '')
        }),
        f.hay
          ? el('span.cd-precio', { text: D.dinero(f.subtotal) })
          : el('span.cd-nota', { text: f.nota || 'no lo vende' })
      ]));
    });

    detalle.appendChild(el('div.cd-total', [
      el('span', { text: carro.faltan.length ? 'Total de lo que sí tiene' : 'Total' }),
      el('strong', { text: D.dinero(carro.total) })
    ]));

    const fila = el('button.fila-carro' +
      (opciones.mejor ? '.es-mejor' : '') +
      (opciones.parcial ? '.es-parcial' : ''), { type: 'button' }, [
      el('span.fc-flecha', { text: '›' }),
      el('span.fc-tienda', { text: carro.tienda.nombre }),
      opciones.mejor ? el('span.chapa', { text: 'más barato' }) : null,
      carro.faltan.length
        ? el('span.fc-faltan', { text: carro.faltan.length === 1 ? 'le falta 1' : 'le faltan ' + carro.faltan.length })
        : el('span.fc-faltan', { text: '' }),
      el('span.fc-total' + (opciones.parcial ? '.fc-apagado' : ''), { text: D.dinero(carro.total) })
    ]);

    fila.addEventListener('click', () => {
      const abrir = detalle.hidden;
      acordeon.forEach((otro) => { otro.detalle.hidden = true; otro.fila.classList.remove('is-abierto'); });
      detalle.hidden = !abrir;
      fila.classList.toggle('is-abierto', abrir);
    });

    acordeon.push({ fila, detalle });
    tarjeta.appendChild(fila);
    tarjeta.appendChild(detalle);
  }

  /* Lo que gana cada supermercado, en vez de la tabla de artículo por artículo
     que había antes.

     El cambio lo pidió Pablo y mejora la pantalla: la tabla anterior repetía los
     cinco supermercados en cada artículo —setenta y cinco cifras para una lista
     de quince— y había que reconstruir a mano quién ganaba qué. Agrupado por
     tienda se lee de un vistazo, y el detalle de un artículo concreto sigue a un
     toque de distancia en su ficha. */
  function tarjetaLoMasBarato(reco) {
    const rep = reco.repartido;

    const tarjeta = el('section.card', [
      el('h2.card-title', { text: 'Lo más barato de cada supermercado' })
    ]);

    if (!rep.paradas.length) {
      tarjeta.appendChild(el('p.muted', { text: 'Todavía no hay precios con los que comparar.' }));
      return tarjeta;
    }

    tarjeta.appendChild(el('p.reco-total', { text: D.dinero(rep.total) }));
    tarjeta.appendChild(el('p.hint', {
      text: rep.paradas.length === 1
        ? 'Comprándolo todo en ' + rep.paradas[0].tienda.nombre + ', que gana en todo.'
        : (reco.mejorCarro
            ? 'Comprando cada cosa donde es más barata: ' + D.dinero(reco.ahorroRepartiendo) +
              ' menos que en ' + reco.mejorCarro.tienda.nombre + ', pero hay que ir a ' +
              rep.paradas.length + ' supermercados.'
            : 'Comprando cada cosa donde es más barata, en ' + rep.paradas.length + ' supermercados.')
    }));

    rep.paradas.forEach((p) => {
      tarjeta.appendChild(el('div.mb-tienda', [
        el('span.mb-nombre', { text: p.tienda.nombre }),
        el('span.mb-total', { text: D.dinero(p.total) })
      ]));
      p.items.forEach((it) => {
        tarjeta.appendChild(el('a.mb-item', { href: '#/articulo/' + it.art.id }, [
          el('span.mb-art', { text: it.art.nombre + (it.cantidad > 1 ? '  ×' + it.cantidad : '') }),
          el('span.mb-precio', { text: D.dinero(it.subtotal) })
        ]));
      });
    });

    if (rep.sinPrecio.length) {
      tarjeta.appendChild(aviso(rep.sinPrecio.length === 1
        ? '1 artículo no tiene precio en ningún supermercado, así que no está contado.'
        : rep.sinPrecio.length + ' artículos no tienen precio en ningún supermercado, así que no están contados.', 'ojo'));
    }

    return tarjeta;
  }

  /* ===========================================================================
     AJUSTES
     =========================================================================== */

  function ajustes() {
    const a = Store.ajustes();
    const caja = el('div');
    caja.appendChild(header('Ajustes'));

    caja.appendChild(tarjetaIntermediario(a));
    caja.appendChild(tarjetaSucursal(a));
    caja.appendChild(tarjetaTiendas(a));
    caja.appendChild(tarjetaCategorias());
    caja.appendChild(tarjetaCopia());
    caja.appendChild(tarjetaVersion());

    return caja;
  }

  function tarjetaIntermediario(a) {
    const url = el('input', { type: 'url', value: a.url, placeholder: 'https://script.google.com/…/exec', 'aria-label': 'Dirección del intermediario' });
    const clave = el('input', { type: 'text', value: a.clave, placeholder: 'la clave que pusiste en el script', 'aria-label': 'Clave' });
    const estado = el('p.ref');

    const guardar = el('button.btn.btn-primary', {
      type: 'button', text: 'Guardar',
      onclick: () => {
        Store.guardarAjustes({ url: url.value.trim(), clave: clave.value.trim() });
        estado.textContent = 'Guardado.';
      }
    });

    const probar = el('button.btn', { type: 'button', text: 'Probar' });
    probar.addEventListener('click', async () => {
      Store.guardarAjustes({ url: url.value.trim(), clave: clave.value.trim() });
      probar.disabled = true;
      estado.textContent = 'Probando…';
      try {
        await Precios.probar();
        estado.textContent = 'Funciona.';
      } catch (err) {
        estado.textContent = err.message;
      } finally {
        probar.disabled = false;
      }
    });

    return el('section.card', [
      el('h2.card-title', { text: 'Intermediario' }),
      el('p.muted', {
        text: 'Los supermercados no dejan que una página web les pregunte precios directamente, así que hace falta un pequeño script en tu cuenta de Google que lo haga por ella. No guarda nada.'
      }),
      el('label.campo', [el('span', { text: 'Dirección (termina en /exec)' }), url]),
      el('label.campo', [el('span', { text: 'Clave' }), clave]),
      el('div.form-actions', [guardar, probar]),
      estado
    ]);
  }

  /* La sucursal importa de verdad: el mismo yogurt cuesta ₡3.550 en la mayoría
     de las tiendas de Auto Mercado y ₡3.635 en tres de ellas. Sin elegirla, el
     precio que enseña la app es el de otra tienda. */
  function tarjetaSucursal(a) {
    const sel = el('select', {
      'aria-label': 'Sucursal de Auto Mercado',
      onchange: (ev) => { Store.guardarAjustes({ sucursalAM: ev.target.value }); App.render(); }
    }, Store.SUCURSALES_AM.map((s) =>
      el('option', { value: s.id, selected: a.sucursalAM === s.id, text: s.nombre })));

    const elegida = Store.SUCURSALES_AM.find((s) => s.id === a.sucursalAM);
    const dePlaya = ['10', '11', '12'].indexOf(a.sucursalAM) >= 0;

    return el('section.card', [
      el('h2.card-title', { text: 'Sucursal de Auto Mercado' }),
      el('p.muted', { text: 'Auto Mercado cobra distinto según la tienda, así que hay que decirle a la app a cuál vas. Los otros cuatro supermercados tienen un solo precio.' }),
      el('label.campo', [el('span', { text: 'Tienda' }), sel]),
      dePlaya
        ? el('p.hint-box', {
            text: 'Ojo: ' + (elegida ? elegida.nombre : 'esa sucursal') + ' es de las tres de playa, y cobran más caro que el resto. El mismo yogurt que en San José cuesta ₡3.550 ahí sale a ₡3.635.'
          })
        : null
    ]);
  }

  function tarjetaTiendas(a) {
    const tarjeta = el('section.card', [
      el('h2.card-title', { text: 'Supermercados a comparar' }),
      el('p.muted', { text: 'Quitar los que no te queden cerca hace la consulta más rápida y la comparación más útil.' })
    ]);

    Store.TIENDAS.forEach((t) => {
      const casilla = el('input', {
        type: 'checkbox',
        checked: a.tiendas[t.id] !== false,
        onchange: (ev) => {
          const tiendas = Object.assign({}, Store.ajustes().tiendas);
          tiendas[t.id] = ev.target.checked;
          Store.guardarAjustes({ tiendas: tiendas });
        }
      });
      tarjeta.appendChild(el('label.fila-check', [casilla, el('span', { text: t.nombre })]));
    });

    return tarjeta;
  }

  /* Las categorías van en el orden en que se recorre el súper, no por nombre, y
     ese orden se enseña tal cual para que se entienda de dónde sale el de la
     lista. */
  function tarjetaCategorias() {
    const tarjeta = el('section.card', [
      el('h2.card-title', { text: 'Categorías' }),
      el('p.muted', {
        text: 'Agrupan la lista por secciones del súper, en este mismo orden. La app adivina la categoría de cada artículo por su nombre y se puede corregir en su ficha.'
      })
    ]);

    Store.categorias().forEach((c) => {
      const cuantos = Store.cuantosEn(c.id);
      tarjeta.appendChild(el('div.fila-cat', [
        el('span.fc-nombre', { text: c.nombre }),
        el('span.ref', { text: cuantos ? String(cuantos) : '' }),
        c.id === 'otros'
          ? el('span.ref', { text: 'fija' })
          : el('button.cat-quitar', {
              type: 'button', text: '×', 'aria-label': 'Quitar ' + c.nombre,
              onclick: () => {
                /* Se dice cuántos artículos se mueven ANTES de borrar. «¿Borrar
                   Limpieza?» a secas no deja decidir nada. */
                const aviso = cuantos
                  ? '¿Quitar «' + c.nombre + '»?\n\nSus ' + cuantos +
                    (cuantos === 1 ? ' artículo pasará' : ' artículos pasarán') + ' a «Otros». No se borra ninguno.'
                  : '¿Quitar «' + c.nombre + '»?';
                if (!confirm(aviso)) return;
                Store.borrarCategoria(c.id);
                App.render();
              }
            })
      ]));
    });

    tarjeta.appendChild(el('button.btn', {
      type: 'button', text: '+ Añadir una categoría',
      onclick: () => {
        const nombre = prompt('¿Cómo se llama?\n\nPor ejemplo: Bebé, Farmacia, Fiesta');
        if (!nombre || !nombre.trim()) return;
        Store.agregarCategoria(nombre.trim());
        App.render();
      }
    }));

    tarjeta.appendChild(el('p.hint', { text: 'Quitar una categoría nunca borra artículos: pasan a «Otros».' }));
    return tarjeta;
  }

  function tarjetaCopia() {
    const exportar = el('button.btn', {
      type: 'button', text: 'Guardar una copia',
      onclick: () => {
        const blob = new Blob([Store.exportAll()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'milistadecompras-' + D.hoy() + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    });

    const archivo = el('input', { type: 'file', accept: 'application/json,.json' });
    archivo.addEventListener('change', () => {
      const f = archivo.files && archivo.files[0];
      if (!f) return;
      const lector = new FileReader();
      lector.onload = () => {
        try {
          Store.importAll(String(lector.result));
          alert('Copia restaurada.');
          App.render();
        } catch (err) {
          alert('Ese archivo no se pudo leer: ' + err.message);
        }
      };
      lector.readAsText(f);
    });

    return el('section.card', [
      el('h2.card-title', { text: 'Copia de seguridad' }),
      el('p.muted', { text: 'Todo vive en este teléfono. Si lo cambias o borras los datos del navegador, se pierde.' }),
      exportar,
      el('label.campo', [el('span', { text: 'Restaurar una copia' }), archivo]),
      el('p.hint', { text: 'La copia lleva dentro la clave del intermediario, así que no la compartas.' })
    ]);
  }

  /* La versión se lee de la caja donde el modo sin conexión guarda los archivos
     —que se llama 'milistadecompras-vNN'— y no de una constante escrita a mano.
     Así se enseña la versión que el teléfono TIENE INSTALADA, que es lo que uno
     quiere saber al preguntarse «¿ya me entró la nueva?». Una constante aparte
     se podría olvidar de subir y mentiría, que es peor que no estar. */
  function tarjetaVersion() {
    const tarjeta = el('section.card');
    tarjeta.appendChild(el('h2.card-title', { text: 'Versión' }));
    const linea = el('p.ref', { text: 'Comprobando…' });
    const detalle = el('p.hint');
    tarjeta.appendChild(linea);
    tarjeta.appendChild(detalle);

    if (global.caches && caches.keys) {
      caches.keys().then((nombres) => {
        const mias = nombres.filter((n) => n.indexOf('milistadecompras-v') === 0);
        if (!mias.length) {
          linea.textContent = 'Sin modo sin conexión';
          detalle.textContent = 'Pasa con el servidor local: el navegador de escritorio no lo permite.';
          return;
        }
        // Ojo: comparadas como texto, la v9 sale DESPUÉS de la v22.
        mias.sort((a, b) => numeroDeVersion(b) - numeroDeVersion(a));
        linea.textContent = mias[0];
        detalle.textContent = 'Es la versión instalada en este teléfono.';
      }).catch(() => { linea.textContent = 'No se pudo comprobar'; });
    } else {
      linea.textContent = 'Sin modo sin conexión';
    }

    tarjeta.appendChild(el('button.btn', {
      type: 'button', text: 'Buscar una versión nueva',
      onclick: async () => {
        if (!navigator.serviceWorker) { location.reload(); return; }
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
        location.reload();
      }
    }));

    return tarjeta;
  }

  function numeroDeVersion(nombre) {
    const m = String(nombre).match(/-v(\d+)$/);
    return m ? Number(m[1]) : 0;
  }

  /* ---------- lo que se exporta ------------------------------------------------ */

  global.Views = {
    helpers: { header, vacio, aviso },
    lista, despensa, agregar, articuloDetalle, comparar, ajustes,
    listas, listaDetalle,
    olvidarBorradores, hayBorrador, adivinarContenido
  };

})(window);
