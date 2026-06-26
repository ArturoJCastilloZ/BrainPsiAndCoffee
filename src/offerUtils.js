export const isOfferLive = (offer, date = new Date()) => {
  if (offer?.active === false) return false;
  const today = date.toISOString().slice(0, 10);
  if (offer?.startsAt && offer.startsAt > today) return false;
  if (offer?.endsAt && offer.endsAt < today) return false;
  return true;
};

export const activeOffers = (offers, date = new Date()) => (
  (offers || []).filter((offer) => isOfferLive(offer, date))
);
