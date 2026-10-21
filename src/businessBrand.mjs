// The legacy Brainpsi brand includes the optional module's name. Derive
// its display form without rewriting stored branding or legal identity.
export const businessDisplayName = (settings) => {
  const name = String(settings?.name || 'Brainpsi Coffee').trim();
  return settings?.cafeEnabled === false && /^brainpsi\s+coffee$/i.test(name)
    ? name.replace(/\s+coffee$/i, '')
    : name;
};
