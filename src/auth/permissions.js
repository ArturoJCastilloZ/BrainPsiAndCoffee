export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN_CAFE: 'admin_cafe',
  ADMIN_CONSULTORIO: 'admin_consultorio',
  DOCTOR: 'doctor',
  BARISTA: 'barista',
};

export const normalizeRole = (role) => {
  if (role === 'admin') return ROLES.SUPER_ADMIN;
  return role || 'user';
};

export const isSuperAdmin = (role) => normalizeRole(role) === ROLES.SUPER_ADMIN;
export const isCafeAdmin = (role) => normalizeRole(role) === ROLES.ADMIN_CAFE;
export const isClinicAdmin = (role) => normalizeRole(role) === ROLES.ADMIN_CONSULTORIO;
export const isDoctor = (role) => normalizeRole(role) === ROLES.DOCTOR;
export const isBarista = (role) => normalizeRole(role) === ROLES.BARISTA;

export const canAccessAdmin = (role) => (
  isSuperAdmin(role) || isCafeAdmin(role) || isClinicAdmin(role) || isBarista(role)
);

export const canAccessDoctor = (role) => isDoctor(role);

export const canAccessCafe = (role) => (
  isSuperAdmin(role) || isCafeAdmin(role) || isBarista(role)
);

export const canAccessClinic = (role) => (
  isSuperAdmin(role) || isClinicAdmin(role)
);

export const canManageOrders = (role) => canAccessCafe(role);
export const canCreateOrders = (role) => isSuperAdmin(role) || isCafeAdmin(role);
export const canManageCafeCatalog = (role) => isSuperAdmin(role) || isCafeAdmin(role);
export const canManageClinicCatalog = (role) => isSuperAdmin(role) || isClinicAdmin(role);
export const canManageBusinessSettings = (role) => isSuperAdmin(role);
export const canManageAppointments = (role) => canAccessClinic(role);
export const canViewDashboard = (role) => isSuperAdmin(role);

export const firstAllowedAdminPage = (role) => {
  if (canViewDashboard(role)) return 'general-dashboard';
  if (canManageOrders(role)) return 'cafe-orders';
  if (canManageAppointments(role)) return 'clinic-appointments';
  if (canManageCafeCatalog(role)) return 'cafe-products';
  if (canManageClinicCatalog(role)) return 'clinic-services';
  if (canManageBusinessSettings(role)) return 'general-business';
  return null;
};

export const canAccessAdminPage = (role, page) => {
  if (page === 'general-dashboard') return canViewDashboard(role);
  if (page === 'general-business') return canManageBusinessSettings(role);
  if (page === 'cafe-orders') return canManageOrders(role);
  if (page === 'cafe-products' || page === 'cafe-offers') return canManageCafeCatalog(role);
  if (
    page === 'clinic-appointments' ||
    page === 'clinic-services' ||
    page === 'clinic-therapists' ||
    page === 'clinic-specialties'
  ) return page === 'clinic-appointments' ? canManageAppointments(role) : canManageClinicCatalog(role);
  return false;
};
