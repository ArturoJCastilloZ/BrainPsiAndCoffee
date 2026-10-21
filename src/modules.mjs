// Missing configuration preserves existing clinics. Only an explicit false
// disables the module; the database validates and enforces the same flag.
export const isCafeEnabled = (settings) => settings?.cafeEnabled !== false;
