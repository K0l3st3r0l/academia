// Vertical Slice question bank — replace with DB-backed content in Fase 3
const QUESTION_BANK = {
  matematica: [
    {
      text: '¿Cuánto es 7 × 8?',
      options: ['54', '56', '58', '64'],
      correct: '56',
      hint: 'Multiplica 7 por 8',
    },
    {
      text: '¿Cuál es la mitad de 144?',
      options: ['62', '70', '72', '76'],
      correct: '72',
      hint: '144 ÷ 2',
    },
    {
      text: '¿Cuántos lados tiene un hexágono?',
      options: ['4', '5', '6', '8'],
      correct: '6',
      hint: 'Hexa- significa seis',
    },
    {
      text: '¿Cuál es el 25% de 200?',
      options: ['25', '40', '50', '75'],
      correct: '50',
      hint: '25% = 1/4',
    },
    {
      text: '¿Cuánto es 15² (quince al cuadrado)?',
      options: ['150', '175', '200', '225'],
      correct: '225',
      hint: '15 × 15',
    },
  ],
  lenguaje: [
    {
      text: '¿Cuál de estas palabras es un sustantivo?',
      options: ['correr', 'rápido', 'árbol', 'felizmente'],
      correct: 'árbol',
      hint: 'Un sustantivo nombra personas, animales o cosas',
    },
    {
      text: '¿Qué figura literaria hay en "el viento susurra secretos"?',
      options: ['Metáfora', 'Comparación', 'Personificación', 'Hipérbole'],
      correct: 'Personificación',
      hint: 'Se le atribuye una acción humana a algo que no es humano',
    },
    {
      text: '¿Cuál es el sinónimo de "veloz"?',
      options: ['lento', 'rápido', 'fuerte', 'alto'],
      correct: 'rápido',
      hint: 'Significa que algo se mueve con mucha rapidez',
    },
    {
      text: '¿Qué tipo de texto es una receta de cocina?',
      options: ['Narrativo', 'Descriptivo', 'Instructivo', 'Argumentativo'],
      correct: 'Instructivo',
      hint: 'Da instrucciones paso a paso para hacer algo',
    },
    {
      text: '¿Cuál de estas oraciones está escrita en tiempo futuro?',
      options: [
        'Ayer jugué fútbol',
        'Estoy jugando fútbol',
        'Jugaré fútbol mañana',
        'Jugaba fútbol siempre',
      ],
      correct: 'Jugaré fútbol mañana',
      hint: 'El tiempo futuro indica algo que pasará después',
    },
  ],
  ciencias: [
    {
      text: '¿Cuál es el planeta más grande del sistema solar?',
      options: ['Saturno', 'Júpiter', 'Neptuno', 'Urano'],
      correct: 'Júpiter',
      hint: 'Es el quinto planeta desde el Sol',
    },
    {
      text: '¿Qué proceso realizan las plantas para producir su alimento?',
      options: ['Respiración', 'Digestión', 'Fotosíntesis', 'Evaporación'],
      correct: 'Fotosíntesis',
      hint: 'Usan luz solar, agua y CO₂',
    },
    {
      text: '¿Cuántos huesos tiene el cuerpo humano adulto?',
      options: ['106', '186', '206', '256'],
      correct: '206',
      hint: 'Los bebés tienen más huesos que los adultos',
    },
    {
      text: '¿Cuál es el estado del agua a 0°C?',
      options: ['Gas', 'Líquido', 'Sólido', 'Plasma'],
      correct: 'Sólido',
      hint: '0°C es el punto de congelación del agua',
    },
    {
      text: '¿Qué tipo de animal es una ballena?',
      options: ['Pez', 'Reptil', 'Anfibio', 'Mamífero'],
      correct: 'Mamífero',
      hint: 'Respira aire y amamanta a sus crías',
    },
  ],
  historia: [
    {
      text: '¿En qué año llegó Cristóbal Colón a América?',
      options: ['1392', '1492', '1592', '1692'],
      correct: '1492',
      hint: 'Fue en el siglo XV',
    },
    {
      text: '¿Cuál fue la primera capital de Chile?',
      options: ['Valparaíso', 'Concepción', 'Santiago', 'La Serena'],
      correct: 'Santiago',
      hint: 'Pedro de Valdivia la fundó en 1541',
    },
    {
      text: '¿Qué civilización construyó Machu Picchu?',
      options: ['Azteca', 'Maya', 'Inca', 'Olmeca'],
      correct: 'Inca',
      hint: 'Está ubicada en Perú',
    },
    {
      text: '¿Qué héroe de la Independencia de Chile murió en Rancagua en 1814?',
      options: ['Bernardo O\'Higgins', 'José Miguel Carrera', 'Juan Martínez de Rozas', 'Manuel Rodríguez'],
      correct: 'Bernardo O\'Higgins',
      hint: 'El Desastre de Rancagua fue parte de la Reconquista española',
    },
    {
      text: '¿Qué océano baña la costa oeste de Chile?',
      options: ['Atlántico', 'Ártico', 'Índico', 'Pacífico'],
      correct: 'Pacífico',
      hint: 'Es el océano más grande del mundo',
    },
  ],
  ingles: [
    {
      text: 'What is the translation of "biblioteca"?',
      options: ['bookstore', 'library', 'museum', 'school'],
      correct: 'library',
      hint: 'It\'s a place where you borrow books for free',
    },
    {
      text: 'Which word is a verb?',
      options: ['happy', 'quickly', 'run', 'blue'],
      correct: 'run',
      hint: 'Verbs are action or state words',
    },
    {
      text: 'What is the plural of "child"?',
      options: ['childs', 'childes', 'children', 'child\'s'],
      correct: 'children',
      hint: 'It\'s an irregular plural',
    },
    {
      text: 'Complete: "Yesterday I ___ to school."',
      options: ['go', 'goes', 'going', 'went'],
      correct: 'went',
      hint: '"Went" is the past tense of "go"',
    },
    {
      text: 'What does "brave" mean?',
      options: ['cobarde', 'valiente', 'inteligente', 'amable'],
      correct: 'valiente',
      hint: 'A hero is usually described as brave',
    },
  ],
  general: [
    {
      text: '¿Cuántos días tiene un año bisiesto?',
      options: ['364', '365', '366', '367'],
      correct: '366',
      hint: 'Ocurre cada 4 años aproximadamente',
    },
    {
      text: '¿Cuál es el país más grande del mundo por superficie?',
      options: ['China', 'Estados Unidos', 'Canadá', 'Rusia'],
      correct: 'Rusia',
      hint: 'Abarca dos continentes',
    },
    {
      text: '¿Cuántos colores tiene el arcoíris?',
      options: ['5', '6', '7', '8'],
      correct: '7',
      hint: 'Rojo, naranja, amarillo, verde, azul, índigo, violeta',
    },
    {
      text: '¿Cuál es el metal más abundante en la corteza terrestre?',
      options: ['Hierro', 'Aluminio', 'Cobre', 'Oro'],
      correct: 'Aluminio',
      hint: 'También es el metal más reciclado del mundo',
    },
    {
      text: '¿Cuántos continentes hay en el mundo?',
      options: ['5', '6', '7', '8'],
      correct: '7',
      hint: 'América del Norte y del Sur cuentan como dos',
    },
  ],
};

function getQuestions(subject, count = 5) {
  const bank = QUESTION_BANK[subject] || QUESTION_BANK.general;
  const shuffled = [...bank].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

module.exports = { getQuestions, QUESTION_BANK };
