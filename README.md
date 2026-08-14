# 🍽️ El Rincón de las Tapas — Libro de reservas online

Aplicación web completa para que tus clientes reserven mesa por internet y para que
vosotros, el restaurante, recibáis y gestionéis todas las reservas desde un panel privado.

No usa ninguna librería externa: funciona solo con Node.js (versión 22.5 o superior),
que ya trae el servidor web y la base de datos incorporados. Esto la hace muy fácil de publicar.

---

## ¿Qué incluye?

- **Página del cliente** (`/`): formulario elegante para reservar día, hora, número de
  comensales, datos de contacto y sugerencias. Al reservar, el cliente ve una
  **confirmación bonita** con su código de reserva.
- **Panel del restaurante** (`/admin`): protegido con contraseña. Muestra todas las
  reservas ordenadas por día y hora, con resumen del día, filtros y botones para
  **confirmar, cancelar o eliminar** cada reserva.
- **Base de datos** que guarda todas las reservas (archivo `reservas.db`).
- **Control de aforo**: no deja reservar más comensales de los permitidos por franja horaria.
- **Validaciones**: horario 11:00–23:00, no permite fechas u horas pasadas, comprueba el correo, etc.
- **Notificaciones opcionales** por **correo** y **WhatsApp** al cliente (y aviso al restaurante).
  Si no las configuras, la app funciona igual y simplemente no envía nada.

---

## Probarlo en tu ordenador (paso a paso)

1. Instala **Node.js 22.5 o superior** desde https://nodejs.org (elige la versión "Current" o LTS ≥ 22.5).
2. Descomprime esta carpeta.
3. Abre una terminal dentro de la carpeta y ejecuta:

   ```
   node server.js
   ```

4. Abre el navegador:
   - Clientes: **http://localhost:3000/**
   - Panel del restaurante: **http://localhost:3000/admin**
     (contraseña por defecto: **tapas2026**)

Eso es todo: ya puedes hacer reservas de prueba y verlas en el panel.

> Si dejas este programa funcionando en un ordenador del restaurante que esté siempre
> encendido, ya tienes un sistema de reservas en tu red local sin coste mensual.

---

## Personalización rápida

Puedes cambiar estos valores con **variables de entorno** (sin tocar el código):

| Variable          | Para qué sirve                                  | Valor por defecto        |
|-------------------|-------------------------------------------------|--------------------------|
| `ADMIN_PASSWORD`  | Contraseña del panel del restaurante            | `tapas2026`              |
| `AFORO_FRANJA`    | Máximo de comensales por franja de 30 min       | `40`                     |
| `RESTAURANTE`     | Nombre que aparece en la web                     | El Rincón de las Tapas   |
| `TELEFONO`        | Teléfono de contacto (aparece al pie)            | (vacío)                  |
| `PORT`            | Puerto del servidor                              | `3000`                   |

Ejemplo en la terminal:

```
ADMIN_PASSWORD="MiClaveSegura" AFORO_FRANJA=30 node server.js
```

> **Importante:** antes de publicarlo en internet, cambia la contraseña por defecto.

El horario (11:00–23:00, todos los días) y las franjas de 30 minutos están definidos
al principio del archivo `server.js`, en el bloque `CONFIG`, por si algún día quieres ajustarlos.

---

## Notificaciones por correo y WhatsApp (opcional)

Cuando un cliente reserva, la app puede enviarle automáticamente una confirmación por
**correo** y por **WhatsApp**, y avisar también al restaurante. Todo es opcional: solo se
envía lo que configures. Si no pones estas claves, no pasa nada, la reserva funciona igual.

### 📧 Correo (con Resend)

[Resend](https://resend.com) es un servicio de envío de correos con plan gratuito.

1. Crea una cuenta en https://resend.com.
2. Verifica tu dominio (para poder enviar desde `reservas@tudominio.com`). Si aún no tienes
   dominio, para pruebas puedes enviarte correos a ti mismo usando su remitente de prueba.
3. Copia tu **API Key** (empieza por `re_...`).
4. Define estas variables de entorno:

   | Variable            | Ejemplo                                                    |
   |---------------------|------------------------------------------------------------|
   | `RESEND_API_KEY`    | `re_xxxxxxxxxxxx`                                           |
   | `EMAIL_FROM`        | `El Rincón de las Tapas <reservas@tudominio.com>`          |
   | `EMAIL_RESTAURANTE` | `reservas@tudominio.com` *(para recibir el aviso de cada reserva; opcional)* |

### 💬 WhatsApp (con Twilio)

WhatsApp **no permite** enviar mensajes libremente: hace falta la *WhatsApp Business API*.
La forma más fácil de empezar es [Twilio](https://www.twilio.com/whatsapp), que además
ofrece un **sandbox gratuito** para hacer pruebas al instante.

1. Crea una cuenta en Twilio.
2. Para probar ya: activa el **Sandbox de WhatsApp** (Messaging → Try it out → Send a WhatsApp
   message). Twilio te da un número (p. ej. `+1 415 523 8886`) y un código; cada cliente que
   quiera recibir mensajes en el sandbox debe enviar una vez ese código por WhatsApp a ese número.
3. Copia tu **Account SID** y **Auth Token** del panel de Twilio.
4. Define estas variables de entorno:

   | Variable                 | Ejemplo                          |
   |--------------------------|----------------------------------|
   | `TWILIO_ACCOUNT_SID`     | `ACxxxxxxxxxxxx`                 |
   | `TWILIO_AUTH_TOKEN`      | `xxxxxxxxxxxx`                   |
   | `TWILIO_WHATSAPP_FROM`   | `whatsapp:+14155238886`         |
   | `WHATSAPP_RESTAURANTE`   | `600999888` *(para que os llegue a vosotros cada reserva; opcional)* |
   | `PAIS_PREFIJO`           | `+34` *(prefijo que se añade a los teléfonos locales; por defecto +34)* |

> **Para producción real** (enviar a cualquier cliente sin que tenga que apuntarse al sandbox),
> Twilio requiere dar de alta un número de WhatsApp Business y aprobar una *plantilla de mensaje*.
> Es un trámite que se hace desde el panel de Twilio y suele tardar poco.

Los teléfonos se convierten solos a formato internacional: si un cliente escribe `600 111 222`,
se envía a `+34600111222`.

---

## Publicarlo en internet con Render (para que reserven desde cualquier sitio)

Render (https://render.com) mantiene la app encendida y sabe guardar las reservas.
Este proyecto incluye un archivo `render.yaml` que rellena la configuración casi sola.

**Paso a paso:**

1. Sube esta carpeta a un repositorio de **GitHub** (puedes hacerlo desde la web de GitHub
   con "Add file → Upload files", sin instalar nada).
2. Crea una cuenta en https://render.com (puedes entrar con tu cuenta de GitHub).
3. En Render pulsa **New +** → **Blueprint** y elige tu repositorio. Al detectar el
   `render.yaml`, Render rellena solo el comando de arranque y la comprobación de estado.
   *(Alternativa manual: **New +** → **Web Service**, y usa Start Command `node server.js`.)*
4. Cuando te pida el valor de **`ADMIN_PASSWORD`**, escribe la contraseña que quieras para el panel.
5. Pulsa **Apply / Create**. En un par de minutos tendrás una dirección tipo
   `https://rincon-tapas.onrender.com` que podrás poner en tu web, Google, Instagram, etc.

### ⚠️ Muy importante: que no se pierdan las reservas

El **plan gratis** de Render es ideal para *probar*, pero tiene dos limitaciones: la app
"se duerme" tras 15 min sin visitas (tarda ~1 min en despertar) y, sobre todo, **borra las
reservas guardadas cada vez que se duerme o se reinicia**. Para recibir reservas de verdad,
elige una de estas opciones:

- **Recomendado — Plan Starter (~7 $/mes) con disco permanente:** en `render.yaml`, cambia
  `plan: free` por `plan: starter` y descomenta el bloque `disk` (y la variable `DB_PATH`).
  Así las reservas se guardan para siempre y la app no se duerme.
- **Base de datos gratuita de Render (Postgres):** mantiene los datos a salvo incluso en el
  plan gratis, pero requiere adaptar el código para usar Postgres en lugar del archivo SQLite.

Otra opción totalmente válida y sin coste mensual es **tener la app funcionando en un
ordenador del propio restaurante** (ver "Probarlo en tu ordenador"): las reservas se guardan
en ese ordenador y no dependes de ningún servicio externo.

---

## Estructura de los archivos

```
rincon-tapas/
├── server.js            ← el servidor y la lógica de reservas
├── notificaciones.js    ← envío de correo (Resend) y WhatsApp (Twilio)
├── index.html           ← página del cliente (reservar)
├── admin.html           ← panel del restaurante
├── render.yaml          ← configuración para publicar en Render
├── package.json         ← datos del proyecto
├── reservas.db          ← base de datos (se crea sola al arrancar)
└── README.md            ← este archivo
```

---

## Ideas para más adelante

- Bloquear días concretos (festivos, vacaciones, eventos privados).
- Recordatorio automático el día antes de la reserva.
- Estadísticas de ocupación por día y franja.

Si quieres, puedo añadir cualquiera de estas mejoras. ¡Buen provecho! 🍷
