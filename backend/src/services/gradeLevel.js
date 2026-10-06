// '5° Básico A' -> '5b'. Courses outside 1°–8° básico have no curricular grade.
function deriveGradeLevel(courseName) {
  if (!courseName) return null;
  const match = courseName.match(/(\d+)\s*°/);
  if (!match) return null;
  const grade = parseInt(match[1], 10);
  if (grade < 1 || grade > 8) return null;
  return `${grade}b`;
}

module.exports = { deriveGradeLevel };
