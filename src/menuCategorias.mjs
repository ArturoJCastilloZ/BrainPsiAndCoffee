// Las categorias del menu de cafeteria: su clave, como se llama la
// pestaña y como se titula la seccion.
//
// Esto es ESTRUCTURA del producto, no catalogo de un cliente: dice que
// existen cuatro secciones y como se llaman, no que se vende ni a que
// precio. Los productos —con sus precios— salen de la base.
//
// Estaba en DOS sitios: la forma de MENU en data.js y las pestañas de
// MenuPage, con etiquetas distintas para lo mismo ("Calientes" contra
// "Bebidas calientes"). Al retirar data.js se unifica aqui, que es lo que
// el canon pide cuando dos lugares deciden el mismo dato.
export const MENU_CATEGORIAS = [
  { id: 'hot',      pestana: 'Calientes', titulo: 'Bebidas calientes',       size: '12 oz' },
  { id: 'cold',     pestana: 'Frías',     titulo: 'Bebidas frías',           size: '16 oz' },
  { id: 'drinks',   pestana: 'Bebidas',   titulo: 'Refrescos, jugos y agua' },
  { id: 'desserts', pestana: 'Postres',   titulo: 'Postres' },
];

// El esqueleto vacio del menu: las secciones existen aunque la clinica no
// haya publicado productos. Sin esto, una seccion sin productos no se
// podria ni nombrar.
export const menuVacio = () => MENU_CATEGORIAS.reduce((acc, c) => ({
  ...acc,
  [c.id]: { title: c.titulo, ...(c.size ? { size: c.size } : {}), items: [] },
}), {});
