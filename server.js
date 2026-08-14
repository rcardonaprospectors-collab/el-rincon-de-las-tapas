/**
 * El Rincón de las Tapas — Libro de reservas online
 * Servidor sin dependencias externas: módulos integrados de Node (http + node:sqlite).
 * Requiere Node.js 22.5 o superior.
 */
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { enviarNotificaciones, estadoNotificaciones } = require('./notificaciones');

// ------------------------------------------------------------------
// Configuración (personalizable con variables de entorno al publicar)
// ------------------------------------------------------------------
const CONFIG = {
  restaurante: process.env.RESTAURANTE || 'El Rincón de las Tapas',
  telefono: process.env.TELEFONO || '',
  direccion: process.env.DIRECCION || '',
  aperturaHora: 11,          // abre a las 11:00
  ultimaReservaHora: 22,     // última franja 22:30 (cierre 23:00)
  intervaloMin: 30,          // franjas de 30 min
  aforoPorFranja: Number(process.env.AFORO_FRANJA || 40),
  maxComensales: 20,
  diasAntelacion: 90,
  adminPassword: process.env.ADMIN_PASSWORD || 'tapas2026',
  port: Number(process.env.PORT || 3000),
};

// ------------------------------------------------------------------
// Base de datos SQLite
// ------------------------------------------------------------------
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'reservas.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL,
    email TEXT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    comensales INTEGER NOT NULL,
    sugerencias TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    codigo TEXT NOT NULL,
    creada TEXT NOT NULL
  );
`);

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
function generarFranjas() {
  const f = [];
  for (let h = CONFIG.aperturaHora; h <= CONFIG.ultimaReservaHora; h++) {
    for (let m = 0; m < 60; m += CONFIG.intervaloMin) {
      if (h === CONFIG.ultimaReservaHora && m > 30) break;
      f.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return f;
}
const FRANJAS = generarFranjas();

function isoDesplazado(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hoyISO = () => isoDesplazado(0);
const generarCodigo = () => 'RT-' + crypto.randomBytes(3).toString('hex').toUpperCase();

// ------------------------------------------------------------------
// Sesiones del panel (en memoria)
// ------------------------------------------------------------------
const sesiones = new Set();
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}
const esAdmin = req => {
  const c = parseCookies(req);
  return c.admin && sesiones.has(c.admin);
};

// ------------------------------------------------------------------
// Helpers HTTP
// ------------------------------------------------------------------
function enviarJSON(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}
function leerBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}
// Solo se sirven estas dos páginas (por seguridad no se expone ningún otro archivo).
const PAGINAS = { '/': 'index.html', '/admin': 'admin.html' };
function servirPagina(res, ruta) {
  const archivo = PAGINAS[ruta];
  if (!archivo) { res.writeHead(404); return res.end('No encontrado'); }
  fs.readFile(path.join(__dirname, archivo), (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

// ------------------------------------------------------------------
// Lógica de reservas
// ------------------------------------------------------------------
function crearReserva(datos) {
  const { nombre, telefono, email, fecha, hora, comensales, sugerencias } = datos;
  if (!nombre || !String(nombre).trim()) return { code: 400, error: 'Indica tu nombre.' };
  if (!telefono || !String(telefono).trim()) return { code: 400, error: 'Indica un teléfono de contacto.' };
  if (!fecha || !hora) return { code: 400, error: 'Elige día y hora.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { code: 400, error: 'Fecha no válida.' };
  if (!FRANJAS.includes(hora)) return { code: 400, error: 'La hora elegida está fuera del horario (11:00–23:00).' };

  const n = parseInt(comensales, 10);
  if (!Number.isInteger(n) || n < 1 || n > CONFIG.maxComensales)
    return { code: 400, error: `El número de comensales debe estar entre 1 y ${CONFIG.maxComensales}.` };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { code: 400, error: 'El correo electrónico no tiene un formato válido.' };
  if (fecha < hoyISO()) return { code: 400, error: 'No se puede reservar para un día que ya ha pasado.' };
  if (fecha > isoDesplazado(CONFIG.diasAntelacion))
    return { code: 400, error: 'Esa fecha está demasiado lejos, elige un día más próximo.' };

  if (fecha === hoyISO()) {
    const ahora = new Date();
    const [hh, mm] = hora.split(':').map(Number);
    if (hh < ahora.getHours() || (hh === ahora.getHours() && mm <= ahora.getMinutes()))
      return { code: 400, error: 'Esa hora ya ha pasado, elige una franja posterior.' };
  }

  const ocupados = db.prepare(
    `SELECT COALESCE(SUM(comensales),0) AS total FROM reservas WHERE fecha=? AND hora=? AND estado!='cancelada'`
  ).get(fecha, hora).total;
  if (ocupados + n > CONFIG.aforoPorFranja) {
    const libres = Math.max(0, CONFIG.aforoPorFranja - ocupados);
    return { code: 409, error: libres > 0
      ? `Lo sentimos, en esa franja solo quedan ${libres} plazas. Prueba con otra hora.`
      : 'Lo sentimos, esa franja está completa. Prueba con otra hora.' };
  }

  const codigo = generarCodigo();
  const info = db.prepare(
    `INSERT INTO reservas (nombre,telefono,email,fecha,hora,comensales,sugerencias,estado,codigo,creada)
     VALUES (?,?,?,?,?,?,?,'pendiente',?,?)`
  ).run(
    String(nombre).trim(), String(telefono).trim(), email ? String(email).trim() : null,
    fecha, hora, n, sugerencias ? String(sugerencias).trim() : null, codigo, new Date().toISOString()
  );
  return { code: 200, ok: true, id: info.lastInsertRowid, codigo, restaurante: CONFIG.restaurante };
}

// ------------------------------------------------------------------
// Servidor
// ------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ruta = url.pathname;
  const m = req.method;

  try {
    // ---- API pública ----
    if (ruta === '/api/config' && m === 'GET') {
      return enviarJSON(res, 200, {
        restaurante: CONFIG.restaurante, telefono: CONFIG.telefono, direccion: CONFIG.direccion,
        franjas: FRANJAS, maxComensales: CONFIG.maxComensales,
        hoy: hoyISO(), maxFecha: isoDesplazado(CONFIG.diasAntelacion),
        notificaciones: estadoNotificaciones(),
      });
    }
    if (ruta === '/api/reservas' && m === 'POST') {
      const datos = await leerBody(req);
      const r = crearReserva(datos);
      if (r.error) return enviarJSON(res, r.code, { error: r.error });
      // La reserva ya está guardada: enviamos las notificaciones sin bloquear la respuesta.
      const reserva = {
        nombre: String(datos.nombre).trim(),
        telefono: String(datos.telefono).trim(),
        email: datos.email ? String(datos.email).trim() : null,
        fecha: datos.fecha, hora: datos.hora,
        comensales: parseInt(datos.comensales, 10),
        sugerencias: datos.sugerencias ? String(datos.sugerencias).trim() : null,
        codigo: r.codigo,
      };
      enviarNotificaciones(reserva, CONFIG.restaurante).catch(e => console.error('Notificaciones:', e));
      return enviarJSON(res, 200, { ok: true, id: r.id, codigo: r.codigo, restaurante: r.restaurante });
    }

    // ---- Login / logout ----
    if (ruta === '/api/admin/login' && m === 'POST') {
      const { password } = await leerBody(req);
      if (password === CONFIG.adminPassword) {
        const token = crypto.randomBytes(24).toString('hex');
        sesiones.add(token);
        return enviarJSON(res, 200, { ok: true },
          { 'Set-Cookie': `admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` });
      }
      return enviarJSON(res, 401, { error: 'Contraseña incorrecta.' });
    }
    if (ruta === '/api/admin/logout' && m === 'POST') {
      const c = parseCookies(req);
      if (c.admin) sesiones.delete(c.admin);
      return enviarJSON(res, 200, { ok: true }, { 'Set-Cookie': 'admin=; HttpOnly; Path=/; Max-Age=0' });
    }

    // ---- API protegida ----
    if (ruta.startsWith('/api/admin/')) {
      if (!esAdmin(req)) return enviarJSON(res, 401, { error: 'No autorizado' });

      if (ruta === '/api/admin/reservas' && m === 'GET') {
        const fecha = url.searchParams.get('fecha');
        const estado = url.searchParams.get('estado');
        let sql = 'SELECT * FROM reservas WHERE 1=1'; const params = [];
        if (fecha) { sql += ' AND fecha=?'; params.push(fecha); }
        if (estado && estado !== 'todas') { sql += ' AND estado=?'; params.push(estado); }
        sql += ' ORDER BY fecha ASC, hora ASC';
        const reservas = db.prepare(sql).all(...params);
        const hoy = hoyISO();
        const resumen = {
          hoy: db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(comensales),0) p FROM reservas WHERE fecha=? AND estado!='cancelada'`).get(hoy),
          pendientes: db.prepare(`SELECT COUNT(*) c FROM reservas WHERE estado='pendiente' AND fecha>=?`).get(hoy).c,
        };
        return enviarJSON(res, 200, { reservas, resumen });
      }

      let mm = ruta.match(/^\/api\/admin\/reservas\/(\d+)\/estado$/);
      if (mm && m === 'POST') {
        const { estado } = await leerBody(req);
        if (!['pendiente', 'confirmada', 'cancelada'].includes(estado))
          return enviarJSON(res, 400, { error: 'Estado no válido.' });
        const info = db.prepare('UPDATE reservas SET estado=? WHERE id=?').run(estado, Number(mm[1]));
        return enviarJSON(res, info.changes ? 200 : 404, info.changes ? { ok: true } : { error: 'No encontrada.' });
      }
      mm = ruta.match(/^\/api\/admin\/reservas\/(\d+)$/);
      if (mm && m === 'DELETE') {
        db.prepare('DELETE FROM reservas WHERE id=?').run(Number(mm[1]));
        return enviarJSON(res, 200, { ok: true });
      }
      return enviarJSON(res, 404, { error: 'Ruta no encontrada' });
    }

    // ---- Páginas ----
    if (m === 'GET' && (ruta === '/' || ruta === '/admin')) return servirPagina(res, ruta);

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  } catch (e) {
    console.error(e);
    enviarJSON(res, 500, { error: 'Error interno del servidor.' });
  }
});

server.listen(CONFIG.port, () => {
  console.log(`\n  🍽️  ${CONFIG.restaurante} — Reservas`);
  console.log(`  ➜  Cliente:  http://localhost:${CONFIG.port}/`);
  console.log(`  ➜  Panel:    http://localhost:${CONFIG.port}/admin   (contraseña: ${CONFIG.adminPassword})\n`);
});
