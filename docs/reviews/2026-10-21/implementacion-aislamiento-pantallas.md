# Memoria de pantallas aislada por contexto de acceso

El callback de carga del hook CRUD dependía de los permisos booleanos, pero no de la identidad o clínica. Cambiar de consultorio manteniendo el mismo rol podía conservar citas, pedidos y catálogos anteriores. Los paneles también conservaban su propio estado, como pacientes, notas, contabilidad y borradores. No se demostró un salto de RLS: el problema era memoria de interfaz.

`App` coloca ahora todo el workspace, incluido `useSupabaseCrud`, dentro de `SessionScope`. La clave del workspace usa usuario, clínica, rol, especialista, nivel MFA y obligación de cambiar contraseña. Si cambia alguno, React desmonta el árbol anterior y monta uno con estado vacío antes de mostrar los nuevos datos. Esto también descarta selecciones y borradores anteriores: guardar un borrador de otra clínica sería incorrecto. Las preferencias persistidas de tema se recuperan como antes.

La clave excluye el token y la expiración de inactividad: renovar el token o mover el ratón no remonta las pantallas ni borra formularios. Cambiar de nivel MFA sí recarga desde cero para reflejar los datos que RLS permite a ese nivel.

La limpieza del efecto CRUD invalida la generación de carga, por lo que un catálogo tardío de un workspace desmontado no inicia la segunda etapa de consultas privadas con el nuevo contexto. El feed de pedidos invalida su generación y comprueba cancelación antes de adoptar una respuesta pendiente.

## Validación

Diez pruebas en `tests/components/session-scope.test.jsx` montan el límite real y el hook CRUD con API simulada. Cubren cambio de clínica con el mismo rol, limpieza de datos/borradores, respuestas tardías de citas y catálogos, ausencia de recargas por refresco de token/actividad y reinicio por cuenta, rol, especialista, MFA, contraseña obligatoria y logout.

`npm run verify` completado: lint, QA, 63 pruebas reportadas por Node, 78 de Vitest y build correctos. No se repitió la suite SQL porque este lote no cambia la base ni sus contratos.

No se modifican migraciones ni RLS. El desmontaje evita que resultados anteriores se pinten en el nuevo workspace; no cancela una escritura que ya fue enviada al servidor. Las pruebas no sustituyen una comprobación visual con cuentas reales en navegador.

## Entrega

Cambio local de frontend, pendiente de publicación. No requiere aplicar migraciones. La Edge Function de reinicio MFA de la entrega anterior también continúa pendiente de despliegue.
