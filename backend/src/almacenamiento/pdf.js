// Generador mínimo de PDF (una página A4, fuentes estándar Helvetica) sin dependencias.
//
// Es determinista a propósito: con los mismos datos produce exactamente los mismos bytes
// (sin fecha de generación, sin compresión, sin identificadores aleatorios). Así el SHA-256
// guardado en la colección `archivos` permite verificar el fichero y, si se pierde del disco,
// regenerarlo y comprobar que es idéntico al original.

export const A4 = { ancho: 595.28, alto: 841.89 };

// Anchos de glifo (1/1000 em) de Helvetica y Helvetica-Bold para ASCII 32–126 (métricas AFM de Adobe).
const ANCHOS = {
  normal: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611,
    722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  negrita: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611,
    722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
};

// Caracteres de WinAnsiEncoding fuera de Latin-1 que sí tienen glifo en las fuentes estándar.
const WIN_ANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

// Texto → bytes WinAnsi. Lo que no se puede representar se reemplaza por su letra base o por "?".
function codificar(texto) {
  const bytes = [];
  for (const caracter of String(texto).normalize('NFC')) {
    const c = caracter.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff)) bytes.push(c);
    else if (WIN_ANSI[caracter]) bytes.push(WIN_ANSI[caracter]);
    else if (c === 0xa0 || c === 0x202f || c === 0x2009 || c === 0x09) bytes.push(0x20);
    else if (c === 0x2212) bytes.push(0x2d);
    else {
      const base = caracter.normalize('NFD').codePointAt(0);
      bytes.push(base >= 0x20 && base <= 0x7e ? base : 0x3f);
    }
  }
  return Buffer.from(bytes);
}

// Ancho en puntos; las letras acentuadas usan el ancho de su letra base (así lo definen las métricas).
export function anchoTexto(texto, tamano, negrita = false) {
  const tabla = negrita ? ANCHOS.negrita : ANCHOS.normal;
  let total = 0;
  for (const caracter of String(texto).normalize('NFC')) {
    const base = caracter.normalize('NFD').codePointAt(0);
    total += base >= 32 && base <= 126 ? tabla[base - 32] : 556;
  }
  return (total * tamano) / 1000;
}

// Parte un texto en líneas que caben en `ancho` puntos (corta palabras demasiado largas).
export function partirLineas(texto, ancho, tamano, negrita = false) {
  const lineas = [];
  let actual = '';
  for (const palabra of String(texto).split(/\s+/).filter(Boolean)) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (anchoTexto(candidata, tamano, negrita) <= ancho) { actual = candidata; continue; }
    if (actual) lineas.push(actual);
    actual = palabra;
    while (anchoTexto(actual, tamano, negrita) > ancho && actual.length > 1) {
      let corte = actual.length - 1;
      while (corte > 1 && anchoTexto(actual.slice(0, corte), tamano, negrita) > ancho) corte--;
      lineas.push(actual.slice(0, corte));
      actual = actual.slice(corte);
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [''];
}

// Los números se escriben con a lo sumo 2 decimales y sin notación exponencial: salida estable.
const n = valor => {
  const redondeado = Math.round(valor * 100) / 100;
  return Object.is(redondeado, -0) ? '0' : String(redondeado);
};
const color = ([r, g, b]) => `${n(r)} ${n(g)} ${n(b)}`;

// Lienzo de una página. Coordenadas PDF: origen abajo a la izquierda, en puntos.
export function crearPagina() {
  const operaciones = [];
  return {
    rect(x, y, ancho, alto, relleno) {
      operaciones.push(`${color(relleno)} rg ${n(x)} ${n(y)} ${n(ancho)} ${n(alto)} re f`);
    },
    linea(x1, y1, x2, y2, trazo, grosor = 0.6) {
      operaciones.push(`${color(trazo)} RG ${n(grosor)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
    },
    // alinear: 'izq' (x es el inicio), 'der' (x es el final) o 'centro'.
    texto(x, y, contenido, { tamano = 10, negrita = false, relleno = [0, 0, 0], alinear = 'izq' } = {}) {
      const ancho = anchoTexto(contenido, tamano, negrita);
      const inicio = alinear === 'der' ? x - ancho : alinear === 'centro' ? x - ancho / 2 : x;
      const hex = codificar(contenido).toString('hex').toUpperCase();
      operaciones.push(`BT /${negrita ? 'F2' : 'F1'} ${n(tamano)} Tf ${color(relleno)} rg ${n(inicio)} ${n(y)} Td <${hex}> Tj ET`);
    },
    get contenido() {
      return operaciones.join('\n');
    },
  };
}

// Cadena de texto PDF para el diccionario Info (UTF-16BE con BOM: admite cualquier carácter).
const textoInfo = valor => `<FEFF${Buffer.from(String(valor), 'utf16le').swap16().toString('hex').toUpperCase()}>`;

// Fecha PDF en hora de Cali (UTC−5): D:AAAAMMDDHHmmSS-05'00'.
function fechaPdf(fecha) {
  const local = new Date(new Date(fecha).getTime() - 5 * 3600e3).toISOString();
  return `D:${local.slice(0, 4)}${local.slice(5, 7)}${local.slice(8, 10)}${local.slice(11, 13)}${local.slice(14, 16)}${local.slice(17, 19)}-05'00'`;
}

// Ensambla el documento: catálogo, árbol de páginas, página, contenido, fuentes e Info, con su tabla xref.
export function documentoPdf(pagina, { titulo, asunto, autor, fecha }) {
  const contenido = Buffer.from(pagina.contenido, 'latin1');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.ancho} ${A4.alto}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    null, // flujo de contenido (se escribe aparte por ser binario)
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title ${textoInfo(titulo)} /Subject ${textoInfo(asunto)} /Author ${textoInfo(autor)} /Producer ${textoInfo('GymFlow')} /CreationDate (${fechaPdf(fecha)}) >>`,
  ];
  const partes = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  let posicion = partes[0].length;
  const desplazamientos = [];
  objetos.forEach((cuerpo, indice) => {
    desplazamientos.push(posicion);
    const bloque = cuerpo === null
      ? Buffer.concat([Buffer.from(`${indice + 1} 0 obj\n<< /Length ${contenido.length} >>\nstream\n`, 'latin1'), contenido, Buffer.from('\nendstream\nendobj\n', 'latin1')])
      : Buffer.from(`${indice + 1} 0 obj\n${cuerpo}\nendobj\n`, 'latin1');
    partes.push(bloque);
    posicion += bloque.length;
  });
  const xref = [`xref\n0 ${objetos.length + 1}\n`, '0000000000 65535 f \n', ...desplazamientos.map(d => `${String(d).padStart(10, '0')} 00000 n \n`)].join('');
  partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${posicion}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}
