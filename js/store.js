/* ---------------------------------------------------------------------------
   store.js — Los datos. Todo vive en este teléfono (localStorage) y no sale de
   aquí: no hay cuentas, ni servidor, ni nada que subir.

   Tres decisiones que conviene entender antes de tocar nada:

   1. LA DESPENSA Y LA LISTA SON LA MISMA COSA. No hay dos listas que mantener
      sincronizadas: hay una sola lista de artículos y cada uno lleva un
      'pendiente' que dice si hay que comprarlo. Marcar «se acabó» es poner ese
      campo en cierto. Con dos listas separadas habría que acordarse de quitar
      de una lo que se añade a la otra, y tarde o temprano se descuadran.

   2. EL CÓDIGO DE BARRAS (EAN) ES LA LLAVE. Es lo que permite saber que el
      yogurt de Más x Menos y el de Megasuper son el mismo yogurt. Emparejar
      por nombre no funciona: los cinco supermercados lo escriben distinto
      («Yogurt griego Dos Pinos arándanos - 750 ml» contra «YOGURT DOS PINOS
      GRIEGO PLUS LÍQUIDO ARÁNDANO 750 ML»).

      Auto Mercado es la excepción: NO publica el código de barras. Por eso el
      artículo lleva además un 'amId' aparte, que se elige a mano una vez.

   3. EL HISTÓRICO SOLO GUARDA LOS CAMBIOS. Si se guardara cada consulta,
      revisar precios a diario llenaría el teléfono de miles de puntos que
      dicen todos lo mismo. Se apunta un precio solo cuando es DISTINTO del
      último apuntado para ese artículo en esa tienda. Así el histórico es
      exactamente la lista de las veces que cambió el precio, que es la
      pregunta que uno se hace, y ocupa casi nada.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const CLAVE = 'milistadecompras';
  const VERSION_DATOS = 1;

  /* Los cinco supermercados, en el orden en el que se enseñan. El orden importa
     poco salvo por una cosa: los tres primeros son del grupo Walmart y suelen
     tener precios parecidos, así que ponerlos juntos hace la tabla más fácil de
     leer. */
  const TIENDAS = [
    { id: 'masxmenos',   nombre: 'Más x Menos', corto: 'MxM'      },
    { id: 'walmart',     nombre: 'Walmart',     corto: 'Walmart'  },
    { id: 'maxipali',    nombre: 'Maxi Palí',   corto: 'Maxi Palí'},
    { id: 'megasuper',   nombre: 'Megasuper',   corto: 'Megasuper'},
    { id: 'automercado', nombre: 'Auto Mercado', corto: 'Auto M.' }
  ];

  /* Las sucursales de Auto Mercado, sacadas de su propia API el 4 de septiembre
     de 2026 (`automercado.azure-api.net/prod-front/home/getStores`).

     Son 19, y los números NO son correlativos: el 01, 02, 05, 07 y 20 no
     corresponden a ninguna tienda abierta aunque sí aparezcan en los datos de
     precios. Ofrecerlos sería dejar elegir una tienda que no existe.

     El 06 (Moravia) es el de fábrica porque es también el que usa la web de
     Auto Mercado cuando nadie ha elegido nada.

     Cada tienda tiene su propio nivel de precios, así que en principio
     cualquiera puede cobrar distinto. En la práctica casi todas coinciden y se
     despegan las tres de playa —Herradura, Tamarindo y Playas del Coco—, que
     el 4 de septiembre cobraban ₡3.635 por el yogurt que en el resto costaba
     ₡3.550. */
  const SUCURSALES_AM = [
    { id: '03', nombre: 'AM Plaza del Sol (Curridabat)' },
    { id: '04', nombre: 'AM Plaza Mayor (Rohrmoser)' },
    { id: '06', nombre: 'AM Moravia' },
    { id: '08', nombre: 'AM Santa Ana (Lindora)' },
    { id: '09', nombre: 'AM Escazú (Plaza Atlantis)' },
    { id: '10', nombre: 'AM Herradura' },
    { id: '11', nombre: 'AM Tamarindo' },
    { id: '12', nombre: 'AM Playas del Coco' },
    { id: '13', nombre: 'AM Alajuela (La Ceiba)' },
    { id: '14', nombre: 'AM Tres Ríos' },
    { id: '15', nombre: 'AM Guachipelín (Distrito 4)' },
    { id: '16', nombre: 'AM Guácima' },
    { id: '17', nombre: 'AM San Francisco (Heredia)' },
    { id: '18', nombre: 'AM Bratsi (Heredia)' },
    { id: '19', nombre: 'AM Río Oro' },
    { id: '21', nombre: 'AM Guadalupe' },
    { id: '22', nombre: 'AM Guayabos (Curridabat)' },
    { id: '23', nombre: 'AM Cartago (El Molino)' },
    { id: '24', nombre: 'AM Belén' }
  ];

  /* Las categorías, EN EL ORDEN EN QUE SE RECORRE UN SUPERMERCADO.

     Ese orden no es decorativo: es la razón de que existan. Con la lista
     agrupada así se hace la compra de una pasada —primero frutas, al final
     limpieza— en vez de cruzar la tienda de un lado a otro. Por eso el orden lo
     fija esta lista y no el alfabeto.

     'otros' va siempre al final y no se puede borrar: es donde caen los
     artículos de una categoría que se elimine. */
  const CATEGORIAS_DE_FABRICA = [
    { id: 'frutas-verduras',  nombre: 'Frutas y verduras' },
    { id: 'carnes',           nombre: 'Carnes y pescado' },
    { id: 'lacteos',          nombre: 'Lácteos y huevos' },
    { id: 'panaderia',        nombre: 'Panadería' },
    { id: 'congelados',       nombre: 'Congelados' },
    { id: 'abarrotes',        nombre: 'Abarrotes' },
    { id: 'bebidas',          nombre: 'Bebidas' },
    { id: 'limpieza',         nombre: 'Limpieza' },
    { id: 'cuidado-personal', nombre: 'Cuidado personal' },
    { id: 'mascotas',         nombre: 'Mascotas' },
    { id: 'otros',            nombre: 'Otros' }
  ];

  /* Las categorías se copian a los datos del usuario la primera vez y ahí se
     quedan. Sin esto, quien ya tuviera la app instalada no vería nunca una
     categoría nueva de fábrica.

     `sembrarCategorias` añade las que falten UNA SOLA VEZ POR NÚMERO, y ese
     «una sola vez» es lo importante: si se ejecutara en cada arranque, una
     categoría borrada a propósito resucitaría siempre.

     AL AÑADIR CATEGORÍAS DE FÁBRICA EN EL FUTURO, SUBIR SEMILLA.
     (Es la misma máquina que en ControlGastos, y allí hizo falta de verdad.) */
  const SEMILLA = 1;

  const UNIDADES = [
    { id: 'mL', nombre: 'mililitros (mL)' },
    { id: 'L',  nombre: 'litros (L)' },
    { id: 'g',  nombre: 'gramos (g)' },
    { id: 'kg', nombre: 'kilos (kg)' },
    { id: 'unidad', nombre: 'unidades' }
  ];

  const AJUSTES_DE_FABRICA = {
    url: '',            // dirección del intermediario, termina en /exec
    clave: '',          // la misma que se puso en el script
    sucursalAM: '06',   // AM Moravia, el mismo de fábrica que usa su web
    tiendas: { masxmenos: true, walmart: true, maxipali: true, megasuper: true, automercado: true },
    ordenLista: 'categoria',  // 'categoria' | 'alfabetico'
    semilla: 0                // hasta qué número de categorías de fábrica se sembró
  };

  let data = null;

  /* ---------- cargar y guardar ---------------------------------------------- */

  /* OJO: los datos nuevos también hay que sembrarlos.

     Estuvo mal a la primera y no dio ningún error: `sembrarCategorias` se
     llamaba solo desde `migrar`, que únicamente corre cuando YA hay algo
     guardado. En una instalación nueva la lista de categorías quedaba vacía,
     así que todos los artículos salían en «Otros» —la app adivinaba bien la
     categoría, pero no existía ninguna con ese nombre que enseñar—. Se ve
     exactamente igual que si la adivinanza estuviera rota. */
  function vacio() {
    const d = {
      v: VERSION_DATOS,
      articulos: [], listas: [], categorias: [], precios: {}, historial: [],
      compras: [],
      ajustes: clonar(AJUSTES_DE_FABRICA)
    };
    sembrarCategorias(d);
    return d;
  }

  function clonar(x) { return JSON.parse(JSON.stringify(x)); }

  function load() {
    if (data) return data;
    try {
      const crudo = localStorage.getItem(CLAVE);
      data = crudo ? migrar(JSON.parse(crudo)) : vacio();
    } catch (err) {
      console.warn('No se pudieron leer los datos guardados:', err);
      data = vacio();
    }
    return data;
  }

  function save() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(data));
    } catch (err) {
      console.error('No se pudieron guardar los datos:', err);
      alert('No se pudieron guardar los cambios. Puede que el teléfono se haya quedado sin espacio.');
    }
  }

  /* Convierte copias antiguas. Hoy no hay nada que convertir porque solo existe
     la versión 1, pero el hueco está hecho: en ControlGastos hizo falta y se
     descubrió tarde. Ojo con una trampa de allí: importAll TIENE que llamar a
     migrar también, o restaurar una copia vieja deja los datos a medias. */
  function migrar(d) {
    if (!d || typeof d !== 'object') return vacio();
    if (!Array.isArray(d.articulos)) d.articulos = [];
    // Las copias guardadas antes de que existieran las listas no la traen.
    if (!Array.isArray(d.listas)) d.listas = [];
    if (!Array.isArray(d.categorias)) d.categorias = [];
    if (!d.precios || typeof d.precios !== 'object') d.precios = {};
    if (!Array.isArray(d.historial)) d.historial = [];
    // Las copias guardadas antes de que existiera el historial de compras.
    if (!Array.isArray(d.compras)) d.compras = [];
    d.ajustes = Object.assign(clonar(AJUSTES_DE_FABRICA), d.ajustes || {});
    d.ajustes.tiendas = Object.assign(clonar(AJUSTES_DE_FABRICA.tiendas), d.ajustes.tiendas || {});
    d.v = VERSION_DATOS;
    sembrarCategorias(d);

    /* Los artículos guardados antes de que existieran las categorías no traen
       ninguna. Dejarlos así los amontonaría TODOS en «Otros» y la agrupación
       por secciones no serviría de nada justo el día en que se estrena. Se les
       adivina una, que es lo mismo que se hace con los nuevos, y se puede
       corregir en la ficha. */
    d.articulos.forEach((a) => {
      if (!a.categoria) a.categoria = adivinarCategoria(a.nombre);
    });

    return d;
  }

  /* Añade las categorías de fábrica que falten, y solo una vez por número de
     semilla. Ver el comentario de SEMILLA arriba: ejecutarlo en cada arranque
     devolvería a la vida las que se hayan borrado a propósito. */
  function sembrarCategorias(d) {
    if ((d.ajustes.semilla || 0) >= SEMILLA) return;
    CATEGORIAS_DE_FABRICA.forEach((c) => {
      if (!d.categorias.some((x) => x.id === c.id)) d.categorias.push({ id: c.id, nombre: c.nombre });
    });
    d.ajustes.semilla = SEMILLA;
  }

  /* ---------- artículos ------------------------------------------------------ */

  function articulos() {
    return load().articulos.slice().sort((a, b) =>
      D.normal(a.nombre).localeCompare(D.normal(b.nombre), 'es'));
  }

  function articulo(id) {
    return load().articulos.find((a) => a.id === id) || null;
  }

  /* Los pendientes van EN ORDEN ALFABÉTICO.

     Antes salían por cuándo se marcaron, el más reciente arriba, con la idea de
     que lo que acabas de recordar es lo que tienes en la cabeza. Pero eso vale
     mientras escribes la lista, no mientras haces la compra: en el súper la
     lista se lee entera muchas veces buscando «¿ya cogí el café?», y para eso el
     orden tiene que ser el mismo siempre. Un orden que cambia solo cada vez que
     marcas algo obliga a releerla de arriba abajo.

     La agrupación por categoría se hace en la pantalla, sobre esta misma lista,
     así que dentro de cada grupo el orden también es alfabético. */
  function pendientes() {
    return load().articulos
      .filter((a) => a.pendiente)
      .sort((a, b) => D.normal(a.nombre).localeCompare(D.normal(b.nombre), 'es'));
  }

  /* Un precio escrito a mano. Vacío no es cero: dejar el campo en blanco
     significa «no lo sé», y convertirlo en 0 haría que un artículo sin precio
     saliera como gratis en todos los totales. */
  function precioAMano(x) {
    if (x === null || x === undefined || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function guardarArticulo(art) {
    const d = load();
    const limpio = {
      id:        art.id || D.id(),
      nombre:    String(art.nombre || '').trim(),
      ean:       String(art.ean || '').trim(),
      amId:      String(art.amId || '').trim(),
      marca:     String(art.marca || '').trim(),
      contenido: Number(art.contenido) || null,
      unidad:    art.unidad || 'unidad',
      categoria: art.categoria || 'otros',
      imagen:    art.imagen || '',
      /* «A mano»: un artículo que no se busca en ningún supermercado —el pan de
         la panadería, las verduras de la feria, algo que se compra en cualquier
         lado— y cuyo precio se escribe si se quiere. Ver la explicación de por
         qué no compite en comparar.js. */
      libre:        !!art.libre,
      precioManual: precioAMano(art.precioManual),
      pendiente: !!art.pendiente,
      cantidad:  Math.max(1, Number(art.cantidad) || 1),
      marcadoEn: art.marcadoEn || null,
      creadoEn:  art.creadoEn || D.ahora()
    };
    const i = d.articulos.findIndex((a) => a.id === limpio.id);
    if (i >= 0) d.articulos[i] = limpio; else d.articulos.push(limpio);
    save();
    return limpio;
  }

  function borrarArticulo(id) {
    const d = load();
    d.articulos = d.articulos.filter((a) => a.id !== id);
    delete d.precios[id];
    d.historial = d.historial.filter((h) => h.art !== id);
    d.compras = d.compras.filter((c) => c.art !== id);
    /* Y de todas las listas donde estuviera. Sin esto quedan referencias a un
       artículo que ya no existe y la lista enseña huecos —o revienta— la
       próxima vez que se abre. */
    d.listas.forEach((l) => { l.items = l.items.filter((it) => it.art !== id); });
    save();
  }

  /* ¿Ya está este código de barras en la despensa? Sirve para no meter el mismo
     artículo dos veces al buscarlo otra vez sin acordarse. */
  function porEan(ean) {
    if (!ean) return null;
    return load().articulos.find((a) => a.ean === ean) || null;
  }

  function marcarPendiente(id, si) {
    const a = articulo(id);
    if (!a) return;
    a.pendiente = !!si;
    a.marcadoEn = si ? D.ahora() : null;
    if (!si) a.cantidad = 1;   // la cantidad es de esta compra, no del artículo
    save();
  }

  function ponerCantidad(id, n) {
    const a = articulo(id);
    if (!a) return;
    a.cantidad = Math.max(1, Number(n) || 1);
    save();
  }

  /* ---------- historial de compras ------------------------------------------------ */

  /* Quitar algo de la lista y HABERLO COMPRADO no son lo mismo, y hasta ahora la
     app los confundía: el ✓ hacía las dos cosas a la vez. Se separaron porque de
     la diferencia sale el dato que interesa —cada cuánto se compra cada cosa— y
     mezclarlos lo estropearía en las dos direcciones: quitar de la lista algo
     que al final no se compró inventaría una compra, y no poder decir «esto sí
     lo compré» dejaría el historial vacío para siempre.

     Un apunte es {art, fecha 'aaaa-mm-dd', cantidad}. Sin hora: para saber cada
     cuánto se compra el café, el día basta y sobra.

     DOS COMPRAS DEL MISMO ARTÍCULO EL MISMO DÍA SE FUNDEN EN UNA, sumando la
     cantidad. Casi siempre es un toque repetido, y aunque fuera de verdad —dos
     idas al súper el mismo día— guardarlas por separado metería un hueco de
     cero días en el cálculo de la frecuencia y lo arrastraría hacia abajo sin
     que se pueda ver por qué. */
  function marcarComprado(id) {
    const a = articulo(id);
    if (!a) return null;

    const d = load();
    const fecha = D.hoy();
    const cantidad = Math.max(1, Number(a.cantidad) || 1);

    const yaHoy = d.compras.find((c) => c.art === id && c.fecha === fecha);
    if (yaHoy) yaHoy.cantidad += cantidad;
    else d.compras.push({ art: id, fecha: fecha, cantidad: cantidad });

    a.pendiente = false;
    a.marcadoEn = null;
    a.cantidad = 1;   // la cantidad era de esta compra, no del artículo
    save();
    return fecha;
  }

  function comprasDe(id) {
    return load().compras
      .filter((c) => c.art === id)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /* Un ✓ mal dado tiene que poder deshacerse, o el historial se llena de
     compras que no pasaron y la frecuencia deja de valer nada. Como las del
     mismo día están fundidas, art + fecha identifica un apunte sin ambigüedad. */
  function borrarCompra(id, fecha) {
    const d = load();
    d.compras = d.compras.filter((c) => !(c.art === id && c.fecha === fecha));
    save();
  }

  /* Cada cuánto se compra algo, medido y no adivinado.

     'cada' es el promedio de los HUECOS entre compras, no «compras partido por
     meses»: con dos compras seguidas y luego medio año parado, el promedio por
     mes diría una cosa razonable y los huecos dirían la verdad.

     Hace falta más de una compra para que exista un hueco, así que con una sola
     se devuelve 'cada' sin valor. Enseñar «cada 30 días» a partir de un único
     apunte sería inventarse un dato: no se ha visto repetir nada todavía. */
  function frecuencia(id) {
    const compras = comprasDe(id);
    if (!compras.length) return { veces: 0 };

    const ultima = compras[compras.length - 1].fecha;
    const r = {
      veces: compras.length,
      primera: compras[0].fecha,
      ultima: ultima,
      desdeUltima: D.diasEntre(ultima, D.hoy()),
      total: compras.reduce((t, c) => t + (Number(c.cantidad) || 1), 0)
    };

    if (compras.length < 2) return r;

    let suma = 0;
    for (let i = 1; i < compras.length; i++) {
      suma += D.diasEntre(compras[i - 1].fecha, compras[i].fecha);
    }
    r.intervalos = compras.length - 1;
    r.cada = Math.max(1, Math.round(suma / r.intervalos));
    /* «Ya te tocaría» es una observación, no una alarma: ha pasado más tiempo
       del que sueles tardar en volver a comprarlo. Puede que te quede de sobra
       en casa, y por eso en pantalla se dice así y no como un aviso. */
    r.toca = r.desdeUltima >= r.cada;
    return r;
  }

  /* ---------- categorías ---------------------------------------------------------- */

  /* EL ORDEN DE ESTA LISTA ES SIGNIFICATIVO Y ROMPERLO NO DA ERROR: solo empieza
     a etiquetar mal. Se devuelve la primera categoría que encaje, así que lo
     específico va antes que lo general.

     Los choques que hay hoy, y que hay que respetar si se toca:

     - «jabón de tocador» antes que «jabón» — si no, el jabón de baño acaba en
       Limpieza. (Un jabón a secas sí va a Limpieza: es lo que uno espera.)
     - «pasta dental» antes que «pasta» — o el dentífrico acaba en Abarrotes.
     - «papa frita» antes que «papa» — o las papas fritas acaban en verduras.
     - «leche condensada» está en Abarrotes, pero «leche» en Lácteos va antes,
       así que gana Lácteos. Es discutible y se dejó así a propósito: la leche
       condensada se busca donde la leche.

     Es la misma lección que las PISTAS de ControlGastos, donde poner «UBER» a
     secas se comía las tres categorías de Uber.

     Vive aquí y no en views.js porque `migrar` la necesita para etiquetar los
     artículos que se guardaron antes de que existieran las categorías.

     Adivinar mal no es grave: la categoría se ve y se cambia en la ficha del
     artículo. Lo grave sería tener que etiquetar cincuenta productos a mano el
     primer día. */
  const PISTAS = [
    ['cuidado-personal', ['jabon de tocador', 'jabon de bano', 'jabon liquido para manos',
      'pasta dental', 'crema dental', 'cepillo dental', 'hilo dental', 'enjuague bucal',
      'shampoo', 'champu', 'acondicionador', 'desodorante', 'antitranspirante',
      'toalla sanitaria', 'protector diario', 'tampon', 'panal', 'toallita humeda',
      'afeitar', 'rasuradora', 'talco', 'crema corporal', 'bloqueador', 'algodon', 'hisopo']],
    ['mascotas', ['perro', 'gato', 'mascota', 'cachorro', 'arena sanitaria']],
    ['congelados', ['congelado', 'congelada', 'helado', 'nugget', 'papa frita', 'pizza congelada']],
    ['lacteos', ['leche', 'yogurt', 'yoghurt', 'queso', 'natilla', 'mantequilla', 'margarina',
      'crema dulce', 'crema agria', 'huevo', 'huevos', 'cuajada', 'kefir']],
    ['frutas-verduras', ['manzana', 'banano', 'platano', 'tomate', 'cebolla', 'papa', 'zanahoria',
      'lechuga', 'aguacate', 'limon', 'naranja', 'pina', 'sandia', 'papaya', 'melon', 'brocoli',
      'coliflor', 'chile', 'ajo', 'apio', 'culantro', 'cilantro', 'uva', 'fresa', 'mango',
      'pepino', 'yuca', 'camote', 'espinaca', 'repollo', 'vainica', 'chayote']],
    ['carnes', ['pollo', 'carne', 'res', 'cerdo', 'lomo', 'bistec', 'costilla', 'chuleta',
      'pescado', 'filete', 'tilapia', 'camaron', 'jamon', 'salchicha', 'chorizo', 'mortadela',
      'tocineta', 'tocino', 'pavo']],
    ['panaderia', ['pan ', 'pan integral', 'baguette', 'tortilla', 'bollo', 'croissant',
      'reposteria', 'queque', 'bizcocho']],
    ['bebidas', ['agua', 'gaseosa', 'refresco', 'jugo', 'nectar', 'cerveza', 'vino', 'licor',
      'ron ', 'whisky', 'vodka', 'energizante', 'gatorade', 'coca cola', 'pepsi', 'fresco']],
    ['abarrotes', ['arroz', 'frijol', 'azucar', 'sal ', 'aceite', 'vinagre', 'pasta',
      'espagueti', 'macarrones', 'harina', 'atun', 'sardina', 'salsa', 'ketchup', 'mayonesa',
      'mostaza', 'cafe', 'cereal', 'avena', 'galleta', 'maiz', 'lenteja', 'garbanzo',
      'consome', 'caldo', 'condimento', 'canela', 'especias', 'miel', 'mermelada',
      'chocolate', 'sopa', 'palomitas']],
    ['limpieza', ['detergente', 'jabon', 'cloro', 'desinfectante', 'lavaplatos', 'suavizante',
      'escoba', 'esponja', 'servilleta', 'papel higienico', 'papel toalla', 'bolsa de basura',
      'limpiador', 'limpiavidrios', 'ambientador', 'insecticida', 'guantes', 'trapeador']]
  ];

  function adivinarCategoria(nombre) {
    const texto = ' ' + D.normal(nombre) + ' ';
    for (let i = 0; i < PISTAS.length; i++) {
      const cat = PISTAS[i][0];
      const palabras = PISTAS[i][1];
      for (let j = 0; j < palabras.length; j++) {
        // Con espacio delante para no encontrar 'sal' dentro de 'salsa'.
        if (texto.indexOf(' ' + palabras[j]) >= 0) return cat;
      }
    }
    return 'otros';
  }

  /* Se devuelven en el orden en que están guardadas —el del recorrido del
     supermercado— y no por nombre. 'otros' se empuja al final aunque se haya
     añadido algo después: es el cajón de sastre y ahí es donde se espera. */
  function categorias() {
    const lista = load().categorias.slice();
    const i = lista.findIndex((c) => c.id === 'otros');
    if (i >= 0) lista.push(lista.splice(i, 1)[0]);
    return lista;
  }

  function categoria(id) {
    return load().categorias.find((c) => c.id === id) || null;
  }

  function nombreDeCategoria(id) {
    const c = categoria(id);
    return c ? c.nombre : 'Otros';
  }

  function agregarCategoria(nombre) {
    const d = load();
    const limpio = String(nombre || '').trim();
    if (!limpio) return null;

    /* El id sale del nombre pero NO es el nombre: si algún día se permite
       renombrar, los artículos siguen apuntando al mismo sitio. */
    let id = D.normal(limpio).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) return null;
    if (d.categorias.some((c) => c.id === id)) return categoria(id);

    // 'otros' se mantiene el último; la nueva entra justo antes.
    const i = d.categorias.findIndex((c) => c.id === 'otros');
    const nueva = { id, nombre: limpio };
    if (i >= 0) d.categorias.splice(i, 0, nueva); else d.categorias.push(nueva);
    save();
    return nueva;
  }

  /* Borrar una categoría NO borra artículos: pasan a «Otros». Perder productos
     por reorganizar las etiquetas sería un castigo absurdo. */
  function borrarCategoria(id) {
    if (id === 'otros') return;
    const d = load();
    d.categorias = d.categorias.filter((c) => c.id !== id);
    d.articulos.forEach((a) => { if (a.categoria === id) a.categoria = 'otros'; });
    save();
  }

  function cuantosEn(id) {
    return load().articulos.filter((a) => (a.categoria || 'otros') === id).length;
  }

  /* ---------- otras listas ------------------------------------------------------ */

  /* «Queque de manzana», «Fiesta de cumpleaños», «Viaje a la playa»: listas con
     nombre que se guardan enteras y se vuelcan en la compra cuando toca.

     DECISIÓN QUE SOSTIENE TODO ESTO: una lista NO tiene artículos propios, solo
     apunta a los de la despensa. Es lo que hace que funcionen sin escribir ni
     una línea más el código de barras, el emparejamiento con Auto Mercado, los
     precios, el histórico y la comparación: un ingrediente es un artículo como
     cualquier otro.

     La otra opción —que cada lista tuviera sus propios artículos— obligaría a
     emparejar la canela una vez por cada receta que la lleve, y a mantener dos
     catálogos que se desincronizan. La despensa crece con ingredientes que se
     compran poco, y eso es exactamente lo correcto: la despensa no es «lo que
     tengo en casa», es «lo que sé comprar». */

  function listas() {
    return load().listas.slice().sort((a, b) =>
      D.normal(a.nombre).localeCompare(D.normal(b.nombre), 'es'));
  }

  function listaDe(id) {
    return load().listas.find((l) => l.id === id) || null;
  }

  function guardarLista(lista) {
    const d = load();
    const limpia = {
      id:       lista.id || D.id(),
      nombre:   String(lista.nombre || '').trim(),
      items:    (lista.items || []).map((it) => ({
        art: it.art,
        cantidad: Math.max(1, Number(it.cantidad) || 1)
      })),
      creadoEn: lista.creadoEn || D.ahora()
    };
    const i = d.listas.findIndex((l) => l.id === limpia.id);
    if (i >= 0) d.listas[i] = limpia; else d.listas.push(limpia);
    save();
    return limpia;
  }

  function borrarLista(id) {
    const d = load();
    d.listas = d.listas.filter((l) => l.id !== id);
    save();
  }

  /* Un artículo no puede estar dos veces en la misma lista: si ya está, se le
     suma la cantidad. Dos filas del mismo ingrediente serían un error de
     lectura garantizado al hacer la compra. */
  function agregarALista(listaId, artId, cantidad) {
    const l = listaDe(listaId);
    if (!l) return;
    const n = Math.max(1, Number(cantidad) || 1);
    const ya = l.items.find((it) => it.art === artId);
    if (ya) ya.cantidad += n;
    else l.items.push({ art: artId, cantidad: n });
    save();
  }

  function quitarDeLista(listaId, artId) {
    const l = listaDe(listaId);
    if (!l) return;
    l.items = l.items.filter((it) => it.art !== artId);
    save();
  }

  function cantidadEnLista(listaId, artId, cantidad) {
    const l = listaDe(listaId);
    if (!l) return;
    const it = l.items.find((x) => x.art === artId);
    if (it) it.cantidad = Math.max(1, Number(cantidad) || 1);
    save();
  }

  /* Los artículos de una lista, ya resueltos y sin los que se hayan borrado de
     la despensa por otro lado. */
  function articulosDeLista(listaId) {
    const l = listaDe(listaId);
    if (!l) return [];
    return l.items
      .map((it) => {
        const art = articulo(it.art);
        return art ? { articulo: art, cantidad: it.cantidad } : null;
      })
      .filter(Boolean);
  }

  /* Volcar la lista en la compra.

     Las cantidades SE SUMAN a lo que ya hubiera pendiente, no lo reemplazan: si
     ya necesitabas 2 huevos y el queque lleva 3, necesitas 5. Reemplazar
     perdería silenciosamente lo que ya habías apuntado, que es el peor tipo de
     fallo — no se nota hasta que estás en el súper.

     Devuelve cuántos entraron nuevos y a cuántos se les sumó, para poder
     decirlo en pantalla en vez de que la lista cambie sin explicación. */
  function verterEnLaCompra(listaId) {
    const contenido = articulosDeLista(listaId);
    let nuevos = 0, sumados = 0;

    contenido.forEach(({ articulo: art, cantidad }) => {
      if (art.pendiente) {
        art.cantidad = Math.max(1, Number(art.cantidad) || 1) + cantidad;
        sumados++;
      } else {
        art.pendiente = true;
        art.cantidad = cantidad;
        art.marcadoEn = D.ahora();
        nuevos++;
      }
    });

    save();
    return { nuevos, sumados, total: contenido.length };
  }

  /* ---------- precios --------------------------------------------------------- */

  /* Recibe la respuesta del intermediario y la reparte: el último precio de cada
     tienda por un lado (para enseñarlo) y el histórico por otro (para saber si
     algo subió). */
  function guardarPrecios(respuesta, porArticulo) {
    const d = load();
    const cuando = respuesta.consultado || D.ahora();
    const dia = cuando.slice(0, 10);

    (respuesta.items || []).forEach((item, i) => {
      const artId = porArticulo[i];
      if (!artId) return;

      d.precios[artId] = { consultadoEn: cuando, tiendas: item.tiendas || {} };

      Object.keys(item.tiendas || {}).forEach((tid) => {
        const info = item.tiendas[tid];
        /* Ojo con esta comprobación: Number(null) vale 0 y pasaría por buena,
           metiendo un precio de cero en el histórico de un artículo que ese
           supermercado no vende. Está contado en comparar.js. */
        if (!info || info.precio === null || info.precio === undefined || info.precio === '') return;
        const precio = Number(info.precio);
        if (!Number.isFinite(precio)) return;
        apuntarEnHistorico(d, artId, tid, precio, dia);
      });
    });

    save();
  }

  /* Solo se apunta si el precio CAMBIÓ respecto al último apuntado. Ver la
     cabecera del archivo: sin esta regla, revisar a diario llenaría el teléfono
     de puntos idénticos. */
  function apuntarEnHistorico(d, artId, tid, precio, dia) {
    let ultimo = null;
    for (let i = d.historial.length - 1; i >= 0; i--) {
      const h = d.historial[i];
      if (h.art === artId && h.tienda === tid) { ultimo = h; break; }
    }
    if (ultimo && ultimo.precio === precio) return;
    d.historial.push({ fecha: dia, art: artId, tienda: tid, precio: precio });

    // Tope de seguridad. Con la regla de arriba no debería acercarse nunca.
    if (d.historial.length > 4000) d.historial = d.historial.slice(-3000);
  }

  function preciosDe(artId) {
    return load().precios[artId] || null;
  }

  function historialDe(artId, tid) {
    return load().historial
      .filter((h) => h.art === artId && (!tid || h.tienda === tid))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /* ¿Subió o bajó desde la primera vez que lo vimos? Devuelve null cuando solo
     hay un punto: con un solo dato no se puede hablar de subida. */
  function variacion(artId, tid) {
    const h = historialDe(artId, tid);
    if (h.length < 2) return null;
    const primero = h[0];
    const ultimo = h[h.length - 1];
    if (!primero.precio) return null;
    return {
      desde: primero.precio,
      hasta: ultimo.precio,
      pct: Math.round(((ultimo.precio - primero.precio) / primero.precio) * 100),
      desdeFecha: primero.fecha
    };
  }

  /* ---------- ajustes --------------------------------------------------------- */

  function ajustes() { return load().ajustes; }

  function guardarAjustes(nuevos) {
    const d = load();
    d.ajustes = Object.assign(d.ajustes, nuevos || {});
    save();
  }

  function tiendasActivas() {
    const a = ajustes();
    return TIENDAS.filter((t) => a.tiendas[t.id] !== false);
  }

  function configurado() {
    const a = ajustes();
    return !!(a.url && a.clave);
  }

  /* ---------- copia de seguridad ---------------------------------------------- */

  /* A diferencia de ControlGastos, aquí la copia SÍ lleva dentro la clave del
     intermediario. No es una contraseña de ninguna cuenta —solo evita que un
     desconocido gaste la cuota— pero aun así la copia es personal y no se
     comparte. */
  function exportAll() {
    return JSON.stringify(load(), null, 2);
  }

  function importAll(texto) {
    const entrante = JSON.parse(texto);
    data = migrar(entrante);
    save();
    return data;
  }

  function borrarTodo() {
    data = vacio();
    save();
  }

  global.Store = {
    TIENDAS, UNIDADES, SUCURSALES_AM, CATEGORIAS_DE_FABRICA,
    load, save,
    categorias, categoria, nombreDeCategoria, agregarCategoria, borrarCategoria, cuantosEn,
    adivinarCategoria,
    articulos, articulo, guardarArticulo, borrarArticulo, porEan, precioAMano,
    pendientes, marcarPendiente, ponerCantidad,
    marcarComprado, comprasDe, borrarCompra, frecuencia,
    listas, listaDe, guardarLista, borrarLista,
    agregarALista, quitarDeLista, cantidadEnLista, articulosDeLista, verterEnLaCompra,
    guardarPrecios, preciosDe, historialDe, variacion,
    ajustes, guardarAjustes, tiendasActivas, configurado,
    exportAll, importAll, borrarTodo
  };

})(window);
