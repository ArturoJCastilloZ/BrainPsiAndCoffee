// Plantillas de los correos de Supabase Auth (invitacion, recuperar
// contraseña, etc.), en español y con la marca.
//
//   node scripts/email-templates.mjs           escribe supabase/templates/*.html
//   node scripts/email-templates.mjs --apply   ademas las sube al proyecto
//
// --apply usa la Management API: PATCH /v1/projects/{ref}/config/auth.
// Necesita SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF en el entorno
// (.env.migrate). Solo toca asuntos y plantillas: el SMTP y su clave no
// pasan por aqui.
//
// Las variables {{ .ConfirmationURL }}, {{ .Token }}, {{ .NewEmail }} son de
// GoTrue (plantillas Go). Se usa ConfirmationURL y no un enlace armado a
// mano: la app recibe la sesion en la URL (detectSessionInUrl) y ese
// enlace ya trae el destino (/set-password) que pidio la app.
import { mkdirSync, writeFileSync } from 'node:fs';

const MARCA = {
  nombre: 'Brainpsi Coffee',
  fondo: '#F5EFE6',
  tarjeta: '#FFFFFF',
  texto: '#2E2A27',
  suave: '#6B5E54',
  boton: '#5A3E2B',
  botonTexto: '#F5EFE6',
  borde: '#E7DCCD',
};

const boton = (texto) => `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
              <tr>
                <td style="border-radius:999px;background:${MARCA.boton};">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${MARCA.botonTexto};text-decoration:none;border-radius:999px;">${texto}</a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MARCA.suave};">
              Si el botón no funciona, copia este enlace en tu navegador:<br>
              <a href="{{ .ConfirmationURL }}" style="color:${MARCA.boton};word-break:break-all;">{{ .ConfirmationURL }}</a>
            </p>`;

const codigo = `
            <p style="margin:28px 0 8px;font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:bold;letter-spacing:8px;color:${MARCA.texto};">{{ .Token }}</p>`;

const layout = ({ titulo, cuerpo, accion, nota }) => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${titulo}</title>
  </head>
  <body style="margin:0;padding:0;background:${MARCA.fondo};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MARCA.fondo};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 16px;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:${MARCA.boton};">
                ${MARCA.nombre}
              </td>
            </tr>
            <tr>
              <td style="background:${MARCA.tarjeta};border:1px solid ${MARCA.borde};border-radius:16px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:${MARCA.texto};">
            <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;font-weight:normal;color:${MARCA.texto};">${titulo}</h1>
            ${cuerpo.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:${MARCA.texto};">${p}</p>`).join('\n            ')}
            ${accion}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MARCA.suave};">
                ${nota}<br>
                Psicología y café · Monterrey
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const NO_FUISTE = 'Si no esperabas este correo, ignóralo: no se hará ningún cambio en tu cuenta.';
const UNA_VEZ = 'El enlace sirve una sola vez y vence en poco tiempo.';

// clave = nombre de GoTrue: mailer_subjects_<clave> / mailer_templates_<clave>_content
export const PLANTILLAS = {
  invite: {
    asunto: 'Te dieron acceso al panel de Brainpsi Coffee',
    titulo: 'Te dieron acceso al panel',
    cuerpo: [
      'Hola. Te invitaron a usar el panel de Brainpsi Coffee, donde se manejan citas, pedidos y pacientes.',
      'Para entrar, crea tu contraseña:',
    ],
    accion: boton('Crear mi contraseña'),
    nota: `${UNA_VEZ} Si vence, pide a quien te invitó que te mande otra. ${NO_FUISTE}`,
  },
  recovery: {
    asunto: 'Restablece tu contraseña de Brainpsi Coffee',
    titulo: 'Restablece tu contraseña',
    cuerpo: ['Recibimos una solicitud para cambiar la contraseña de tu cuenta. Para elegir una nueva:'],
    accion: boton('Elegir nueva contraseña'),
    nota: `${UNA_VEZ} Si no lo pediste tú, ignora este correo: tu contraseña no cambia.`,
  },
  magic_link: {
    asunto: 'Tu enlace para entrar a Brainpsi Coffee',
    titulo: 'Tu enlace para entrar',
    cuerpo: ['Usa este botón para entrar a tu cuenta sin escribir tu contraseña:'],
    accion: boton('Entrar'),
    nota: `${UNA_VEZ} ${NO_FUISTE}`,
  },
  confirmation: {
    asunto: 'Confirma tu correo en Brainpsi Coffee',
    titulo: 'Confirma tu correo',
    cuerpo: ['Para terminar de crear tu cuenta, confirma que este correo es tuyo:'],
    accion: boton('Confirmar mi correo'),
    nota: `${UNA_VEZ} ${NO_FUISTE}`,
  },
  email_change: {
    asunto: 'Confirma tu nuevo correo en Brainpsi Coffee',
    titulo: 'Confirma tu nuevo correo',
    cuerpo: ['Pediste cambiar el correo de tu cuenta a <strong>{{ .NewEmail }}</strong>. Para confirmarlo:'],
    accion: boton('Confirmar el cambio'),
    nota: `${UNA_VEZ} Si no lo pediste tú, ignora este correo: tu correo no cambia.`,
  },
  reauthentication: {
    asunto: 'Tu código de verificación de Brainpsi Coffee',
    titulo: 'Tu código de verificación',
    cuerpo: ['Para confirmar que eres tú antes de un cambio importante, escribe este código:'],
    accion: codigo,
    nota: `El código vence en poco tiempo. Nadie de Brainpsi te lo va a pedir por teléfono o chat. ${NO_FUISTE}`,
  },
};

export const htmlDe = (clave) => layout(PLANTILLAS[clave]);

export function configAuth() {
  return Object.fromEntries(Object.keys(PLANTILLAS).flatMap((clave) => [
    [`mailer_subjects_${clave}`, PLANTILLAS[clave].asunto],
    [`mailer_templates_${clave}_content`, htmlDe(clave)],
  ]));
}

async function aplicar() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) throw new Error('Faltan SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF en el entorno.');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(configAuth()),
  });
  if (!res.ok) throw new Error(`Supabase respondio ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.log(`plantillas aplicadas: ${Object.keys(PLANTILLAS).join(', ')}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const dir = new URL('../supabase/templates/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const clave of Object.keys(PLANTILLAS)) {
    writeFileSync(new URL(`${clave}.html`, dir), htmlDe(clave));
  }
  console.log(`escritas en supabase/templates/: ${Object.keys(PLANTILLAS).length} plantillas`);
  if (process.argv.includes('--apply')) await aplicar();
}
