// Modificadores del menu de cafe: leche, sabores y extras.
//
// Vivian escritos a mano en data.js y en MenuPage (MILKS, FLAVORS, y los
// recargos de +$10 y +$5). Ahora salen de la base, por clinica, asi que
// el precio que ve el cliente se calcula con datos que alguien puede
// cambiar desde el admin — y por eso mismo conviene que ese calculo este
// aparte y probado, y no enterrado en el JSX de un modal.

export const MILK = 'milk';
export const FLAVOR = 'flavor';
export const ADDON = 'addon';

const porOrden = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);

// Solo lo activo, agrupado por tipo y en el orden que definio el admin.
export const groupOptions = (options = []) => {
  const activos = options.filter((o) => o && o.active !== false);
  return {
    milks: activos.filter((o) => o.kind === MILK).sort(porOrden),
    flavors: activos.filter((o) => o.kind === FLAVOR).sort(porOrden),
    addons: activos.filter((o) => o.kind === ADDON).sort(porOrden),
  };
};

const delta = (option) => {
  const n = Number(option?.priceDelta ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// El total de un producto con sus modificadores.
//
// Se redondea a dos decimales al final y no en cada suma: los precios son
// numeric(10,2) en la base pero aqui son floats, y 30 + 5.1 + 10.2 se
// puede ir a 45.299999999999997 — un centavo fantasma en un total que el
// cliente lee.
// La LECHE tambien suma.
//
// La primera version no la recibia, pero el modal si mandaba su id al
// servidor, y price_of_order_item suma el delta de TODOS los ids. Con una
// leche de pago, el cliente veia $45 y se le cobraban $53. Latente
// mientras las leches esten en 0, que es como las siembra 0021 — se
// activaba la primera vez que alguien editara una desde el admin, que es
// justo la funcion que se acababa de agregar.
export const optionsTotal = (basePrice, { milk = null, flavor = null, addons = [] } = {}) => {
  const base = Number(basePrice) || 0;
  const suma = delta(milk) + delta(flavor) + (addons || []).reduce((acc, a) => acc + delta(a), 0);
  return Math.round((base + suma) * 100) / 100;
};

// Como se describe la eleccion en el carrito y en el pedido.
export const describeSelection = ({ milk = null, flavor = null, addons = [] } = {}) => [
  milk?.name,
  flavor?.name,
  ...(addons || []).map((a) => a.name),
].filter(Boolean);
