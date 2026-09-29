// Same policy as Anahuac staff accounts, so the school explains a single rule.
// Returns null when valid, or the message to show.
function validatePasswordPolicy(password) {
  if (!password || typeof password !== 'string') return 'Escribe una contraseña';
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe tener al menos una letra y un número';
  }
  return null;
}

module.exports = { validatePasswordPolicy };
