export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN_CAFE: 'admin_cafe',
  ADMIN_CONSULTORIO: 'admin_consultorio',
  DOCTOR: 'doctor',
  BARISTA: 'barista',
};

export const normalizeRole = (role) => {
  if (role === 'admin') return ROLES.SUPER_ADMIN;
  // 'owner' es el rol de tenant_members que sustituye al super_admin
  // global: manda dentro de SU clinica, no sobre las demas. Se mapea al
  // mismo permiso para no duplicar la matriz de accesos.
  if (role === 'owner') return ROLES.SUPER_ADMIN;
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
// Repartir permisos solo lo hace el dueño. La base lo vuelve a verificar
// contra tenant_members en vivo: esto solo decide que se dibuja.
export const canManageAccess = (role) => isSuperAdmin(role);
// El horario lo administra la clinica, y el doctor el suyo desde su panel.
export const canManageSchedules = (role) => canAccessClinic(role);
export const canManageAppointments = (role) => canAccessClinic(role);
export const canViewDashboard = (role) => isSuperAdmin(role);

// Contabilidad. Los tres entran, pero cada uno a lo suyo: el area que ve
// NO se decide aqui sino en RLS (0027), porque una policy no se esquiva y
// una pantalla si. Esto solo decide si el menu dibuja la entrada.
export const canViewAccounting = (role) => (
  isSuperAdmin(role) || isCafeAdmin(role) || isClinicAdmin(role)
);

// Que areas puede ELEGIR en el selector. El dueño las dos y el total;
// cada administrador queda fijado a la suya, sin selector que ofrezca algo
// que la base le va a negar igual.
export const accountingAreas = (role) => {
  if (isSuperAdmin(role)) return ['todo', 'consultorio', 'cafeteria'];
  if (isClinicAdmin(role)) return ['consultorio'];
  if (isCafeAdmin(role)) return ['cafeteria'];
  return [];
};

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
  if (page === 'general-access') return canManageAccess(role);
  if (page === 'clinic-schedules') return canManageSchedules(role);
  if (page === 'cafe-orders') return canManageOrders(role);
  if (page === 'general-accounting') return canViewAccounting(role);
  if (page === 'cafe-products' || page === 'cafe-options' || page === 'cafe-offers') return canManageCafeCatalog(role);
  if (
    page === 'clinic-appointments' ||
    page === 'clinic-services' ||
    page === 'clinic-therapists' ||
    page === 'clinic-specialties'
  ) return page === 'clinic-appointments' ? canManageAppointments(role) : canManageClinicCatalog(role);
  return false;
};
