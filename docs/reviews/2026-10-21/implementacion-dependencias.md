# Actualización de dependencias vulnerables

La consulta actual de `npm audit` seguía reportando dos paquetes con severidad alta: Vite 8.3.0 y source-map-js 1.2.1, ambos en el árbol de herramientas de desarrollo/build. No se equipara esto a una explotación demostrada del sitio estático publicado.

Se actualizó la versión mínima de Vite a `^8.3.5` y el lockfile resuelve 8.3.5. source-map-js se actualizó a 1.2.2. También cambiaron dependencias transitivas del build dentro de sus rangos: Rolldown y sus binarios opcionales, tipos de Oxc, PostCSS y nanoid. No se cambiaron dependencias declaradas de ejecución de la aplicación. La instalación usó `--ignore-scripts`.

Los avisos de npm señalan versiones corregidas para [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) y [Vite/launch-editor](https://github.com/advisories/GHSA-587h-7wmj-h5pm). La consulta posterior reportó cero vulnerabilidades conocidas; esto no garantiza ausencia de vulnerabilidades no publicadas ni sustituye las revisiones del código.

`npm run verify` pasó lint, QA, 63 pruebas reportadas por Node, 78 de Vitest y build con las nuevas dependencias. La suite SQL ya pasó con el código de 0046; este lote solo cambia dependencias de build y no requiere otra migración.

## Publicación pendiente

Destino indicado por el usuario: https://brainpsi.vercel.app/. La inspección del HTML y su bundle principal público confirmó HTTP 200, pero no encontró la cadena `create_public_booking` en el bundle servido. No se hizo una reserva de prueba en la base remota. Se debe comprobar el frontend nuevo publicado antes de aplicar 0046.

El repositorio define producción desde `main` en Vercel y tiene una protección local que exige rama y PR. La rama de trabajo es `bug/saas-review-fixes`. La conexión Git por SSH 22 agotó el tiempo y la alternativa por 443 permitió consultar origin sin cambiar permanentemente el remoto ni desactivar la verificación del host.
