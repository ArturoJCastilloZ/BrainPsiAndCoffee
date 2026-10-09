// Fachada de la capa de datos. Antes era un solo archivo de 1100+ lineas;
// ahora cada dominio vive en su modulo (auditoria, seccion 4) y este
// archivo los re-exporta para que ningun import de la app cambie.
export * from './catalogs';
export * from './appointments';
export * from './orders';
export * from './clinical';
export * from './accounting';
export * from './access';
export * from './compliance';
