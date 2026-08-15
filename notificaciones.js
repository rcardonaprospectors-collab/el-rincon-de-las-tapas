/**
 * Notificaciones para las reservas: correo (Resend) y WhatsApp (Twilio).
 * Sin dependencias externas: usa fetch integrado de Node.
 *
 * Todo es OPCIONAL: si no defines las variables de entorno correspondientes,
 * simplemente no se envía nada y la reserva funciona igual.
 */
'use strict';

const ENV = process.env;

// Endpoints (configurables para poder hacer pruebas con un servidor simulado)
const TWILIO_BASE = ENV.TWILIO_API_URL || 'https://api.twilio.com';
const RESEND_URL2 = ENV.RESEND_API_URL || 'https://api.resend.com/emails';
const BREVO_URL = ENV.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';

const cfgEmail = {
  brevoKey: ENV.BREVO_API_KEY || '',       // vía Brevo (sin dominio, solo confirmar el correo)
  resendKey: ENV.RESEND_API_KEY || '',     // vía Resend (con dominio propio)
  fromEmail: ENV.EMAIL_FROM || '',         // dirección remitente, ej: reservas@tudominio.com o tu Gmail
  fromName: ENV.EMAIL_FROM_NAME || 'El Rincón de las Tapas', // nombre que verá el cliente
  restaurante: ENV.EMAIL_RESTAURANTE || '',// copia de aviso para el restaurante (opcional)
};
const cfgWa = {
  sid: ENV.TWILIO_ACCOUNT_SID || '',
  token: ENV.TWILIO_AUTH_TOKEN || '',
  from: ENV.TWILIO_WHATSAPP_FROM || '',    // ej: "whatsapp:+14155238886" (sandbox de Twilio)
  restaurante: ENV.WHATSAPP_RESTAURANTE || '', // número del restaurante para avisos (opcional)
};
const PREFIJO_PAIS = ENV.PAIS_PREFIJO || '+34'; // se añade a números locales sin prefijo

function emailActivo() { return Boolean((cfgEmail.brevoKey || cfgEmail.resendKey) && cfgEmail.fromEmail); }
function whatsappActivo() { return Boolean(cfgWa.sid && cfgWa.token && cfgWa.from); }

function estadoNotificaciones() {
  return { email: emailActivo(), whatsapp: whatsappActivo() };
}

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function fechaBonita(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  return `${DIAS[f.getDay()]}, ${d} de ${MESES[m - 1]} de ${a}`;
}

/** Convierte un teléfono local a formato internacional E.164 (+34XXXXXXXXX). */
function normalizarTelefono(tel) {
  if (!tel) return '';
  let t = String(tel).trim().replace(/[\s\-().]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (t.startsWith('+')) return t;
  // número local: le añadimos el prefijo del país
  return PREFIJO_PAIS + t;
}

// ------------------------------------------------------------------
// Plantillas
// ------------------------------------------------------------------
function textoCliente(r, nombreRest) {
  const nombre = r.nombre.split(' ')[0];
  return (
    `¡Hola ${nombre}! 🍷\n\n` +
    `Tu reserva en ${nombreRest} ha quedado registrada. Estos son los detalles:\n\n` +
    `📅 ${fechaBonita(r.fecha)}\n` +
    `🕒 ${r.hora} h\n` +
    `👥 ${r.comensales} ${r.comensales === 1 ? 'persona' : 'personas'}\n` +
    (r.sugerencias ? `📝 ${r.sugerencias}\n` : '') +
    `🎫 Código: ${r.codigo}\n\n` +
    `Será un placer recibirte. Si necesitas cambiar o cancelar la reserva, responde a este mensaje. ` +
    `¡Buen provecho por adelantado!`
  );
}

function textoRestaurante(r) {
  return (
    `🔔 Nueva reserva (${r.codigo})\n` +
    `${fechaBonita(r.fecha)} · ${r.hora} h\n` +
    `${r.nombre} · ${r.comensales} pers.\n` +
    `📞 ${r.telefono}${r.email ? ' · ✉️ ' + r.email : ''}\n` +
    (r.sugerencias ? `📝 ${r.sugerencias}` : '')
  );
}

function htmlCliente(r, nombreRest) {
  const nombre = r.nombre.split(' ')[0];
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<!DOCTYPE html><html><body style="margin:0;background:#fbf6ec;font-family:Georgia,serif;color:#2b211c">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(150deg,#7a1f2b,#5c141d);color:#fff;border-radius:16px 16px 0 0;padding:28px 24px;text-align:center">
      <div style="color:#c9a24b;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Confirmación de reserva</div>
      <div style="font-size:26px;font-weight:700">${esc(nombreRest)}</div>
    </div>
    <div style="background:#fff;border:1px solid #efe4d0;border-top:none;border-radius:0 0 16px 16px;padding:26px 24px">
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px">¡Hola <strong>${esc(nombre)}</strong>! Hemos recibido tu reserva y será un placer recibirte. 🍷</p>
      <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">
        <tr><td style="padding:9px 0;color:#6f655c;border-bottom:1px solid #f0e8d8">Día</td><td style="padding:9px 0;text-align:right;font-weight:700;border-bottom:1px solid #f0e8d8">${fechaBonita(r.fecha)}</td></tr>
        <tr><td style="padding:9px 0;color:#6f655c;border-bottom:1px solid #f0e8d8">Hora</td><td style="padding:9px 0;text-align:right;font-weight:700;border-bottom:1px solid #f0e8d8">${esc(r.hora)} h</td></tr>
        <tr><td style="padding:9px 0;color:#6f655c;border-bottom:1px solid #f0e8d8">Comensales</td><td style="padding:9px 0;text-align:right;font-weight:700;border-bottom:1px solid #f0e8d8">${r.comensales} ${r.comensales === 1 ? 'persona' : 'personas'}</td></tr>
        ${r.sugerencias ? `<tr><td style="padding:9px 0;color:#6f655c;border-bottom:1px solid #f0e8d8">Sugerencias</td><td style="padding:9px 0;text-align:right;border-bottom:1px solid #f0e8d8">${esc(r.sugerencias)}</td></tr>` : ''}
      </table>
      <div style="text-align:center;margin:22px 0 6px">
        <div style="display:inline-block;border:1.5px dashed #d8c7a6;border-radius:12px;padding:12px 22px">
          <div style="font-size:12px;color:#6f655c;font-family:Arial,sans-serif">Código de reserva</div>
          <div style="font-size:22px;font-weight:700;color:#7a1f2b;letter-spacing:2px;font-family:'Courier New',monospace">${esc(r.codigo)}</div>
        </div>
      </div>
      <p style="font-size:13px;color:#6f655c;text-align:center;font-family:Arial,sans-serif;margin-top:18px">Si necesitas cambiar o cancelar tu reserva, responde a este correo.</p>
    </div>
  </div></body></html>`;
}

// ------------------------------------------------------------------
// Envíos
// ------------------------------------------------------------------
async function enviarEmail(to, subject, html, text) {
  // Brevo (recomendado sin dominio): solo necesita confirmar el remitente
  if (cfgEmail.brevoKey) {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': cfgEmail.brevoKey, 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: cfgEmail.fromName, email: cfgEmail.fromEmail },
        to: [{ email: to }],
        subject, htmlContent: html, textContent: text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text().catch(() => '')}`);
    return true;
  }
  // Resend (con dominio propio verificado)
  const res = await fetch(RESEND_URL2, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfgEmail.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${cfgEmail.fromName} <${cfgEmail.fromEmail}>`, to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
  return true;
}

async function enviarWhatsApp(to, body) {
  const url = `${TWILIO_BASE}/2010-04-01/Accounts/${cfgWa.sid}/Messages.json`;
  const params = new URLSearchParams({
    From: cfgWa.from.startsWith('whatsapp:') ? cfgWa.from : `whatsapp:${cfgWa.from}`,
    To: `whatsapp:${to}`,
    Body: body,
  });
  const auth = Buffer.from(`${cfgWa.sid}:${cfgWa.token}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text().catch(() => '')}`);
  return true;
}

/**
 * Envía todas las notificaciones de una reserva. Nunca lanza error:
 * si algo falla, lo registra en consola y continúa (la reserva ya está guardada).
 */
async function enviarNotificaciones(reserva, nombreRest) {
  const tareas = [];

  if (emailActivo() && reserva.email) {
    tareas.push(
      enviarEmail(
        reserva.email,
        `Tu reserva en ${nombreRest} — ${fechaBonita(reserva.fecha)}`,
        htmlCliente(reserva, nombreRest),
        textoCliente(reserva, nombreRest)
      ).then(() => console.log(`  ✉️  Email enviado a ${reserva.email}`))
       .catch(e => console.warn(`  ⚠️  Email no enviado: ${e.message}`))
    );
  }
  if (emailActivo() && cfgEmail.restaurante) {
    tareas.push(
      enviarEmail(cfgEmail.restaurante, `Nueva reserva ${reserva.codigo} — ${fechaBonita(reserva.fecha)}`,
        `<pre style="font-family:Arial">${textoRestaurante(reserva)}</pre>`, textoRestaurante(reserva))
        .catch(e => console.warn(`  ⚠️  Aviso email al restaurante no enviado: ${e.message}`))
    );
  }

  if (whatsappActivo() && reserva.telefono) {
    const to = normalizarTelefono(reserva.telefono);
    tareas.push(
      enviarWhatsApp(to, textoCliente(reserva, nombreRest))
        .then(() => console.log(`  💬 WhatsApp enviado a ${to}`))
        .catch(e => console.warn(`  ⚠️  WhatsApp no enviado: ${e.message}`))
    );
  }
  if (whatsappActivo() && cfgWa.restaurante) {
    tareas.push(
      enviarWhatsApp(normalizarTelefono(cfgWa.restaurante), textoRestaurante(reserva))
        .catch(e => console.warn(`  ⚠️  Aviso WhatsApp al restaurante no enviado: ${e.message}`))
    );
  }

  await Promise.allSettled(tareas);
}

module.exports = { enviarNotificaciones, estadoNotificaciones, normalizarTelefono, fechaBonita, textoCliente };
