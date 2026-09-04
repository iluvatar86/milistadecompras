/* ---------------------------------------------------------------------------
   dom.js — Ayudas para construir la pantalla sin librerías, más las fechas y
   el formato de dinero.

   Es casi el mismo archivo que en ControlGastos, con dos diferencias: aquí no
   hay dólares (los supermercados de aquí cobran en colones y punto) y en
   cambio hace falta el precio por unidad, que es lo único que permite comparar
   un envase de 750 ml contra uno de un litro.

   Sobre las fechas: en toda la app una fecha es un texto 'aaaa-mm-dd' y nunca
   un objeto Date guardado. new Date('2026-09-04') lo interpreta en hora de
   Greenwich, así que en Costa Rica (UTC-6) devuelve el día anterior a partir
   de las 6 de la tarde. Por eso las fechas se parten a mano.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  /* ---------- construir elementos ------------------------------------------ */

  /* el('div.clase', {atributos}, [hijos]) */
  function el(spec, props, children) {
    const parts = spec.split(/(?=[.#])/);
    const node = document.createElement(parts.shift() || 'div');
    parts.forEach((p) => {
      if (p[0] === '.') node.classList.add(p.slice(1));
      else node.id = p.slice(1);
    });

    if (props && (typeof props !== 'object' || Array.isArray(props))) {
      children = props;
      props = null;
    }

    if (props) {
      Object.keys(props).forEach((key) => {
        const value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (key === 'value') node.value = value;
        else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = !!value;
        else node.setAttribute(key, value);
      });
    }

    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) { children.forEach((c) => append(node, c)); return; }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function svg(tag, attrs, children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (attrs[k] === null || attrs[k] === undefined) return;
      node.setAttribute(k, attrs[k]);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c instanceof Node) node.appendChild(c);
      else if (c !== null && c !== undefined && c !== false) node.appendChild(document.createTextNode(String(c)));
    });
    return node;
  }

  /* ---------- fechas -------------------------------------------------------- */

  const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function hoy() {
    const now = new Date();
    return aIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  function ahora() { return new Date().toISOString(); }

  /* 'aaaa-mm-dd' → Date local (mediodía, para que ningún cambio de horario lo
     mueva al día de al lado). */
  function deIso(iso) {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }

  function aIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function diasEntre(desdeIso, hastaIso) {
    const ms = deIso(hastaIso).getTime() - deIso(desdeIso).getTime();
    return Math.round(ms / 86400000);
  }

  /* '22 de agosto', con el año sólo cuando no es el de ahora. */
  function fechaMedia(iso) {
    if (!iso) return '';
    const d = deIso(iso);
    const mismoAnio = d.getFullYear() === new Date().getFullYear();
    return d.getDate() + ' de ' + MESES_LARGOS[d.getMonth()] + (mismoAnio ? '' : ' de ' + d.getFullYear());
  }

  /* 'hace 2 horas', 'ayer', 'hace 5 días'. Se usa para decir de cuándo son los
     precios que se están enseñando, que es la pregunta que uno se hace al
     mirarlos. Un precio sin fecha invita a confiar en él más de la cuenta. */
  function desdeEntonces(isoCompleto) {
    if (!isoCompleto) return 'nunca';
    const ms = Date.now() - new Date(isoCompleto).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '';
    const min = Math.round(ms / 60000);
    if (min < 2) return 'hace un momento';
    if (min < 60) return 'hace ' + min + ' minutos';
    const horas = Math.round(min / 60);
    if (horas < 24) return 'hace ' + horas + (horas === 1 ? ' hora' : ' horas');
    const dias = Math.round(horas / 24);
    if (dias === 1) return 'ayer';
    if (dias < 31) return 'hace ' + dias + ' días';
    const meses = Math.round(dias / 30);
    return 'hace ' + meses + (meses === 1 ? ' mes' : ' meses');
  }

  /* ---------- dinero -------------------------------------------------------- */

  /* Los colones se escriben sin decimales. Si un precio trae céntimos se
     enseñan, para no mentir sobre lo que devolvió el supermercado. */
  function dinero(monto) {
    const n = Number(monto);
    if (!Number.isFinite(n)) return '—';
    const dec = Math.round(n * 100) % 100 === 0 ? 0 : 2;
    return (n < 0 ? '-' : '') + '₡' + conSeparadores(Math.abs(n), dec);
  }

  /* La agrupación se hace a mano y no con toLocaleString: el navegador devuelve
     'es-CR' con un espacio fino como separador de miles («₡1 050»), que no es
     lo que usa el resto de la app ni lo que se escribe aquí. Dos formatos de
     número en la misma pantalla se leen como un fallo. */
  function conSeparadores(n, decimales) {
    const partes = n.toFixed(decimales).split('.');
    const enteros = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return enteros + (partes[1] ? ',' + partes[1] : '');
  }

  /* ---------- precio por unidad --------------------------------------------- */

  /* La comparación que de verdad importa. Un yogurt de 750 ml a ₡3.100 y otro
     de 1 L a ₡3.900 no se pueden comparar por el precio de la etiqueta: el
     segundo es más caro y sin embargo sale más barato por mililitro.

     Se enseña en la unidad grande (litro, kilo) porque ₡4,13/mL no le dice
     nada a nadie y ₡4.133/L sí. */
  const UNIDAD_GRANDE = {
    mL: { nombre: 'L',  factor: 1000 },
    g:  { nombre: 'kg', factor: 1000 },
    L:  { nombre: 'L',  factor: 1 },
    kg: { nombre: 'kg', factor: 1 },
    unidad: { nombre: 'unidad', factor: 1 }
  };

  function porUnidad(precio, contenido, unidad) {
    const p = Number(precio);
    const c = Number(contenido);
    if (!Number.isFinite(p) || !Number.isFinite(c) || c <= 0) return null;
    const u = UNIDAD_GRANDE[unidad] || UNIDAD_GRANDE.unidad;
    return { valor: (p / c) * u.factor, unidad: u.nombre };
  }

  function textoPorUnidad(precio, contenido, unidad) {
    const r = porUnidad(precio, contenido, unidad);
    if (!r) return '';
    // Por debajo de diez colones la cifra redonda pierde toda la diferencia:
    // ₡4/L y ₡5/L pueden ser ₡4,10 y ₡4,90.
    const n = r.valor < 10 ? conSeparadores(r.valor, 2) : conSeparadores(Math.round(r.valor), 0);
    return '₡' + n + '/' + r.unidad;
  }

  function porcentaje(parte, total) {
    if (!total) return 0;
    return Math.round((parte / total) * 100);
  }

  /* ---------- varios --------------------------------------------------------- */

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* Para buscar sin que las tildes ni las mayúsculas estorben: 'ARÁNDANO' y
     'arandano' tienen que encontrarse el uno al otro. */
  function normal(texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  global.D = {
    el, clear, svg, append,
    hoy, ahora, deIso, aIso, diasEntre, fechaMedia, desdeEntonces,
    dinero, conSeparadores, porUnidad, textoPorUnidad, porcentaje,
    id, normal
  };

})(window);
