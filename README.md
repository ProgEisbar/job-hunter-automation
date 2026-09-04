# Job Hunter Automation

Conjunto de utilidades JavaScript para incorporar ofertas laborales de distintas fuentes a un flujo de búsqueda centralizado. Los normalizadores convierten respuestas de APIs y alertas de correo a una estructura común; una etapa posterior elimina duplicados y prioriza los resultados antes de continuar el procesamiento.

## Flujo de procesamiento

1. Recibir ofertas desde una API o una alerta de empleo.
2. Adaptar cada fuente al mismo modelo de datos.
3. Normalizar campos como título, empresa, ubicación, modalidad y URL.
4. Detectar publicaciones repetidas entre proveedores.
5. Entregar candidatos consistentes a las siguientes etapas del workflow.

## Componentes

- `normalize-job-alerts.js`: procesa alertas de LinkedIn, Indeed y otros proveedores.
- `normalize-getonboard.js`: adapta resultados de Get on Board.
- `normalize-jobicy.js`: adapta resultados de Jobicy.
- `normalize-remotive.js`: adapta resultados de Remotive.
- `deduplicate-job-candidates.js`: deduplica y prioriza ofertas normalizadas.
- `normalize-job-alerts.test.js`: valida el comportamiento del normalizador de alertas.

## Integración con n8n

Los scripts que utilizan `$input` están preparados para ejecutarse en nodos **Code** de n8n. Cada integración debe entregar la respuesta de su proveedor al normalizador correspondiente y administrar tokens o credenciales mediante el sistema de credenciales de n8n.

## Pruebas

Requiere Node.js. Para ejecutar las pruebas incluidas:

```bash
npm test
```
