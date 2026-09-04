/* ---------------------------------------------------------------------------
   app.js — Arranque y navegación entre pantallas.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const el = D.el;
  const screen = document.getElementById('screen');
  const nav = document.getElementById('nav');

  const TABS = [
    {
      hash: '#/lista', label: 'Mi lista',
      icon: ['M4 6h2v2H4z', 'M8 6h12v2H8z', 'M4 11h2v2H4z', 'M8 11h12v2H8z',
        'M4 16h2v2H4z', 'M8 16h12v2H8z']
    },
    {
      hash: '#/despensa', label: 'Despensa',
      icon: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z']
    },
    {
      hash: '#/listas', label: 'Listas',
      icon: ['M6 2h12v20l-6-4.2L6 22z']
    },
    {
      hash: '#/comparar', label: 'Comparar',
      icon: ['M4 13h3v7H4z', 'M10.5 8h3v12h-3z', 'M17 4h3v16h-3z']
    },
    {
      hash: '#/ajustes', label: 'Ajustes',
      icon: ['M3 6h5v2H3z', 'M12 6h9v2h-9z', 'M8 4h4v6H8z',
        'M3 15h9v2H3z', 'M16 15h5v2h-5z', 'M12 13h4v6h-4z']
    }
  ];

  const FORMULARIOS = ['agregar'];

  /* Con la despensa vacía no hay lista que enseñar: se entra por la despensa,
     que es donde está el botón de agregar el primer artículo. */
  function pantallaDeInicio() {
    return Store.articulos().length ? 'lista' : 'despensa';
  }

  function parseHash() {
    const parts = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!parts.length) return { name: pantallaDeInicio(), args: [] };
    return { name: parts[0], args: parts.slice(1) };
  }

  let pantallaAnterior = null;

  function render() {
    const route = parseHash();
    const pantalla = route.name + '/' + route.args.join('/');
    const esRefresco = pantalla === pantallaAnterior;
    const alturaScroll = window.scrollY || document.documentElement.scrollTop || 0;
    let view;

    if (FORMULARIOS.indexOf(route.name) < 0) Views.olvidarBorradores();

    try {
      switch (route.name) {
        case 'despensa':
          view = Views.despensa();
          break;
        case 'agregar':
          /* '#/agregar' a secas, o '#/agregar/lista/<id>' cuando se viene de
             una lista con nombre: el artículo entra también en esa lista. */
          view = Views.agregar(route.args[0] === 'lista' ? route.args[1] : null);
          break;
        case 'listas':
          view = route.args[0] ? Views.listaDetalle(route.args[0]) : Views.listas();
          break;
        case 'articulo':
          view = Views.articuloDetalle(route.args[0], route.args[1] === 'nuevo');
          break;
        case 'comparar':
          view = Views.comparar();
          break;
        case 'ajustes':
          view = Views.ajustes();
          break;
        case 'lista':
        default:
          view = Views.lista();
      }
    } catch (err) {
      console.error(err);
      view = el('div', [
        Views.helpers.header('Algo ha fallado'),
        el('section.card', [
          el('p', { text: 'La pantalla no se ha podido dibujar: ' + err.message }),
          el('a.btn', { href: '#/lista', text: 'Volver al inicio' })
        ])
      ]);
    }

    D.clear(screen);
    screen.appendChild(view);

    /* Al cambiar de pantalla se empieza por arriba. Si solo se está redibujando
       la misma —marcar un artículo, cambiar una cantidad— hay que quedarse
       donde estaba: saltar arriba desorienta y hace perder el hilo. */
    if (esRefresco) window.scrollTo(0, alturaScroll);
    else window.scrollTo(0, 0);

    pantallaAnterior = pantalla;
    paintNav(route.name);
  }

  function paintNav(current) {
    D.clear(nav);
    TABS.forEach((tab) => {
      const activa = ('#/' + current) === tab.hash;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = tab.icon.map((d) => '<path d="' + d + '" fill="currentColor"></path>').join('');
      nav.appendChild(el('a.tab', {
        href: tab.hash,
        class: 'tab' + (activa ? ' is-active' : ''),
        'aria-current': activa ? 'page' : null
      }, [svg, el('span', { text: tab.label })]));
    });
  }

  window.addEventListener('hashchange', render);

  render();

  /* ---------- instalación y funcionamiento sin conexión --------------------- */

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) =>
        console.warn('No se ha podido activar el modo sin conexión:', err));
    });
  }

  let installPrompt = null;
  const installBar = document.getElementById('install');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installBar.hidden = false;
  });

  installBar.querySelector('button.install-yes').addEventListener('click', () => {
    installBar.hidden = true;
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt = null;
  });

  installBar.querySelector('button.install-no').addEventListener('click', () => {
    installBar.hidden = true;
  });

  window.addEventListener('appinstalled', () => { installBar.hidden = true; });

  global.App = { render: render };

})(window);
