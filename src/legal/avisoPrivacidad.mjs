// Aviso de privacidad VERSIONADO (LFPDPPP).
//
// El texto vive aqui, como datos, por tres razones:
//   · la pagina /privacidad lo pinta tal cual;
//   · cada consentimiento guarda la VERSION y el HASH del texto aceptado
//     (consents.document_version / document_hash): asi se puede demostrar
//     QUE leyo la persona, no solo que marco una casilla;
//   · tests/front/legal.test.mjs falla si el texto cambia sin cambiar la
//     version — un aviso editado en silencio invalidaria esa evidencia.
//
// ESTADO: BORRADOR. La estructura sigue los elementos que la ley pide a un
// aviso integral; la redaccion final, los plazos y la base legal los
// revisa el abogado antes de recibir pacientes reales. Mientras estado sea
// 'borrador', la pagina lo dice.
//
// {responsable}, {domicilio} y {correo} se completan con los datos del
// negocio al pintar; no forman parte del hash (cambian sin que cambie el
// aviso).

export const AVISO_PRIVACIDAD = {
  version: '2026-10-borrador-2',
  estado: 'borrador',
  fecha: '2026-10-09',
  secciones: [
    {
      titulo: 'Quién es responsable de tus datos',
      parrafos: [
        '{responsable}, con domicilio en {domicilio}, es responsable del uso y protección de tus datos personales. Para cualquier asunto de privacidad escríbenos a {correo}.',
      ],
    },
    {
      titulo: 'Qué datos recabamos',
      parrafos: [
        'Para agendar: nombre, correo electrónico, teléfono, el servicio que te interesa y la fecha y hora que solicitas. Si la cita es para una niña o un niño, también su nombre y el del adulto responsable.',
        'En consulta, el especialista integra un expediente clínico con datos de salud. Son datos personales sensibles: los recabamos solo con tu consentimiento expreso y por escrito, que se registra en la primera sesión.',
        'Para pedidos de la cafetería: nombre y teléfono.',
      ],
    },
    {
      titulo: 'Para qué los usamos',
      parrafos: [
        'Finalidades necesarias para el servicio: agendar, confirmar y recordarte tus citas; brindarte atención psicológica o neuropsicológica; integrar y conservar tu expediente clínico como lo exige la NOM-004-SSA3-2012; cobrar y facturar; y preparar tus pedidos.',
        'No usamos tus datos para publicidad ni los vendemos. Si algún día quisiéramos usarlos para algo distinto, te pediríamos tu consentimiento antes.',
      ],
    },
    {
      titulo: 'Con quién los compartimos',
      parrafos: [
        'No transferimos tus datos a terceros, salvo cuando una autoridad competente lo requiera conforme a la ley.',
        'Los proveedores de tecnología que alojan la información (base de datos y servidores) la tratan por nuestra cuenta, bajo contrato y sin poder usarla para fines propios.',
      ],
    },
    {
      titulo: 'Tus derechos ARCO y cómo revocar tu consentimiento',
      parrafos: [
        'Puedes pedir acceso a tus datos, su rectificación o cancelación, oponerte a su uso, o revocar el consentimiento que nos diste. Hazlo con el formulario de derechos ARCO de este sitio o escribiendo a {correo}.',
        'Te pediremos una identificación para confirmar que eres el titular o su representante. Respondemos en un plazo máximo de 20 días hábiles.',
        'Ten en cuenta que el expediente clínico debe conservarse por el plazo que marca la norma, aunque pidas su cancelación: en ese caso lo bloqueamos para cualquier otro uso.',
      ],
    },
    {
      titulo: 'Cuánto tiempo los conservamos',
      parrafos: [
        'El expediente clínico, al menos 5 años desde el último acto médico (NOM-004-SSA3-2012). Los datos de citas y pedidos, mientras sean necesarios para el servicio y para cumplir obligaciones fiscales.',
      ],
    },
    {
      titulo: 'Cookies y almacenamiento en tu navegador',
      parrafos: [
        'No usamos cookies de publicidad ni de rastreo. Guardamos en tu navegador tu preferencia de tema claro u oscuro y, si eres parte del personal, tu sesión.',
        'Si activamos estadísticas de uso, registran qué páginas se visitan y en qué paso de la reserva se queda la gente, sin tu nombre ni tus datos de contacto.',
      ],
    },
    {
      titulo: 'Cambios a este aviso',
      parrafos: [
        'Si cambiamos este aviso, publicaremos aquí la nueva versión con su fecha. Cada consentimiento queda ligado a la versión que aceptaste.',
      ],
    },
  ],
};

export const PRIVACY_NOTICE_VERSION = AVISO_PRIVACIDAD.version;

// Lo que se firma: version y secciones, en un orden estable. Sin los datos
// del negocio (las llaves {..} van sin completar).
export const textoCanonico = (aviso = AVISO_PRIVACIDAD) => JSON.stringify({
  version: aviso.version,
  secciones: aviso.secciones.map((s) => ({ titulo: s.titulo, parrafos: s.parrafos })),
});

// SHA-256 en hexadecimal. En el navegador con crypto.subtle; Node 20+
// tambien lo expone como globalThis.crypto.
export async function hashAviso(aviso = AVISO_PRIVACIDAD) {
  const datos = new TextEncoder().encode(textoCanonico(aviso));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const completar = (texto, negocio) => texto
  .replaceAll('{responsable}', negocio.legalName || negocio.name || 'El consultorio')
  .replaceAll('{domicilio}', negocio.address || 'el domicilio indicado en la página de contacto')
  .replaceAll('{correo}', negocio.email || 'el correo de contacto');

// El formato de consentimiento informado que firma el paciente (o su
// adulto responsable) en la primera sesion. El documento es papel o PDF;
// aqui va su version, que el especialista registra al obtenerlo.
export const CONSENTIMIENTO_CLINICO = {
  version: 'ci-2026-10-borrador-1',
  estado: 'borrador',
};
