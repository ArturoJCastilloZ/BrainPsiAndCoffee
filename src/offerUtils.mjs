import { localISO } from './localDay.mjs';

// El dia LOCAL: con toISOString() una promocion que termina hoy dejaba de
// verse a las 18:00 en Monterrey, seis horas antes de tiempo.
export const isOfferLive = (offer, date = new Date()) => {
  if (offer?.active === false) return false;
  const today = localISO(date);
  if (offer?.startsAt && offer.startsAt > today) return false;
  if (offer?.endsAt && offer.endsAt < today) return false;
  return true;
};

export const activeOffers = (offers, date = new Date()) => (
  (offers || []).filter((offer) => isOfferLive(offer, date))
);
