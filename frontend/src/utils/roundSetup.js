// Same rule as the server (deriveGradeLevel in gameSocket.js): «5° Básico A» → '5b'. Prekínder
// and kínder have no grade level, so they have no OA catalog either.
export function gradeLevelOf(courseName) {
  const match = courseName?.match(/(\d+)\s*°/);
  if (!match) return null;
  const grade = parseInt(match[1], 10);
  return grade >= 1 && grade <= 8 ? `${grade}b` : null;
}

// What the teacher chose when creating the room (subject, OA, level, count) travels to the room
// page and survives a reload there; sessionStorage keeps it to this tab.
const key = code => `academia_round_${code}`;

export function saveRoundSetup(code, setup) {
  try {
    sessionStorage.setItem(key(code), JSON.stringify(setup));
  } catch {
    // Without storage the room just opens with the defaults.
  }
}

export function loadRoundSetup(code) {
  try {
    return JSON.parse(sessionStorage.getItem(key(code)));
  } catch {
    return null;
  }
}
