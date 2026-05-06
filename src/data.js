import { C } from './theme';

export const THERAPY_SERVICES = [
  { id: 'psi-adultos', name: 'Psicología para adultos', desc: 'Acompañamiento terapéutico para procesos personales, ansiedad, duelo y desarrollo personal.', duration: 50, price: 600, icon: 'heart', for: 'Adultos' },
  { id: 'psi-infantil', name: 'Psicología infantil', desc: 'Atención psicológica especializada para niños en su desarrollo emocional.', duration: 45, price: 550, icon: 'sparkles', for: 'Niños' },
  { id: 'neuro-adultos', name: 'Neuropsicología adultos', desc: 'Evaluación e intervención de funciones cognitivas en adultos.', duration: 60, price: 800, icon: 'brain', for: 'Adultos' },
  { id: 'neuro-infantil', name: 'Neuropsicología infantil', desc: 'Evaluación neuropsicológica del desarrollo en la infancia.', duration: 60, price: 750, icon: 'brain', for: 'Niños' },
  { id: 'pareja', name: 'Terapia de pareja', desc: 'Espacio para fortalecer y reconstruir la relación de pareja.', duration: 75, price: 900, icon: 'heart', for: 'Pareja' },
  { id: 'evaluacion', name: 'Evaluación neuropsicológica completa', desc: 'Batería completa de pruebas con informe detallado.', duration: 120, price: 2500, icon: 'brain', for: 'Adultos / Niños' }
];

export const THERAPISTS = [
  { id: 't1', name: 'Dra. María González', cedula: 'PSI-8472', specialty: 'Psicología clínica · Adultos', services: ['psi-adultos', 'pareja'], color: C.caramel },
  { id: 't2', name: 'Mtro. Carlos Ramírez', cedula: 'NEU-3391', specialty: 'Neuropsicología', services: ['neuro-adultos', 'neuro-infantil', 'evaluacion'], color: C.sageDark },
  { id: 't3', name: 'Lic. Ana Martínez', cedula: 'PSI-5526', specialty: 'Psicología infantil', services: ['psi-infantil'], color: C.rust },
  { id: 't4', name: 'Dra. Sofía Hernández', cedula: 'PSI-7104', specialty: 'Pareja y familia', services: ['pareja', 'psi-adultos'], color: C.brownMid }
];

export const MENU = {
  hot: {
    title: 'Bebidas calientes', size: '12 oz',
    items: [
      { id: 'h1', name: 'Activación', sub: 'Espresso', price: 30 },
      { id: 'h2', name: 'Hipervigilancia', sub: 'Espresso doble', price: 35 },
      { id: 'h3', name: 'Modo Supervivencia', sub: 'Americano', price: 35 },
      { id: 'h4', name: 'Regulación emocional', sub: 'Latte', price: 50 },
      { id: 'h5', name: 'Comfort Zone', sub: 'Capuchino', price: 50 },
      { id: 'h6', name: 'Dopamina instantánea', sub: 'Mocha', price: 55 }
    ]
  },
  cold: {
    title: 'Bebidas frías', size: '16 oz',
    items: [
      { id: 'c1', name: 'Modo Zombie', sub: 'Americano frío', price: 40 },
      { id: 'c2', name: 'Apego seguro', sub: 'Latte frío', price: 55 },
      { id: 'c3', name: 'Comfort Zone frío', sub: 'Capuchino frío', price: 55 },
      { id: 'c4', name: 'Serotonina en vaso', sub: 'Mocha frío', price: 60 }
    ]
  },
  drinks: {
    title: 'Refrescos, jugos y agua',
    items: [
      { id: 'd1', name: 'Coca-Cola regular', sub: '400 ml', price: 25 },
      { id: 'd2', name: 'Coca-Cola sin azúcar', sub: '400 ml', price: 25 },
      { id: 'd3', name: 'Joyas', sub: '600 ml', price: 30 },
      { id: 'd4', name: 'Jugos del Valle', sub: '250 ml', price: 15 },
      { id: 'd5', name: 'Agua embotellada', sub: '500 ml', price: 15 }
    ]
  },
  desserts: {
    title: 'Postres',
    items: [
      { id: 'p1', name: 'Postre del día', sub: 'Variedad de sabores', price: 45 },
      { id: 'p2', name: 'Rebanada de pastel', sub: 'Pastel del día', price: 65 }
    ]
  }
};

export const FLAVORS = ['Vainilla', 'Pistacho', 'Vainilla francesa (sin azúcar)', 'Caramelo (sin azúcar)'];
export const MILKS = ['Entera', 'Deslactosada'];

export const OFFERS = [
  { id: 'combo-cafe-postre', name: 'Combo café + postre', desc: 'Agrega un café y un postre y paga solo $99 al final.', price: 99, active: true }
];
