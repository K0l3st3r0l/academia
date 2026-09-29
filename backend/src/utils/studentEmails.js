const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Layout adapted from Anahuac's renderRecuperar (utils/correoBienvenida.js),
// with AcademIA's colors and wording for children.
function renderCreatePassword({ firstName, email, link }) {
  const greeting = firstName ? `¡Hola, ${firstName}!` : '¡Hola!';
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f1fb;font-family:Nunito,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px;font-size:28px;font-weight:900;color:#4A1FA8;">Academ<span style="color:#d4a106;">IA</span></td></tr>
<tr><td style="padding:8px 28px 28px;">
  <div style="font-size:18px;font-weight:800;color:#1A1A2E;margin-bottom:8px;">${esc(greeting)}</div>
  <div style="font-size:15px;line-height:1.5;color:#333;margin-bottom:20px;">Pediste crear tu contraseña de AcademIA para <b>${esc(email)}</b>. Aprieta el botón para elegirla.</div>
  <a href="${esc(link)}" style="display:inline-block;background:#6C3CE1;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 24px;border-radius:12px;">Crear mi contraseña</a>
  <div style="font-size:12.5px;line-height:1.45;color:#666;margin-top:16px;">El botón sirve una sola vez y vence en 1 hora. Si no lo pediste tú, no hagas nada: tu contraseña no cambia.</div>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    greeting, '',
    `Pediste crear tu contraseña de AcademIA para ${email}. Elígela con este enlace (vence en 1 hora):`,
    link, '',
    'Si no lo pediste tú, no hagas nada: tu contraseña no cambia.',
  ].join('\n');
  return { subject: 'Crea tu contraseña de AcademIA', html, text };
}

module.exports = { renderCreatePassword };
