# MediTurno Smart — Triaje Automatizado

Taller práctico **Sistemas Full-Stack y Automatización con Google Antigravity, Supabase y N8N** — UPTC, Programación II (Tecnología en Programación de Sistemas Informáticos).

**Caso de estudio 2 — Sector Hospitalario y Salud**

## Problemática

Una clínica ambulatoria presenta congestión en su línea telefónica y demoras en la asignación de citas prioritarias porque los pacientes no son filtrados según la urgencia de sus síntomas antes de agendar.

## Alcance

Portal web de agendamiento médico con persistencia en Supabase y un flujo automatizado en N8N que evalúa el nivel de urgencia reportado, asigna prioridad de atención y envía un comprobante digital al paciente.

> ⚠️ Proyecto académico. La clasificación de urgencia es orientativa y no reemplaza la valoración de un profesional de la salud. En caso de emergencia, comuníquese con la línea **123**.

## Arquitectura

```
Frontend (HTML + Tailwind + JS)  ──POST JSON──▶  N8N (Webhook → Clasificación → Supabase → Respond → Email)
        │                                                     │
        └──── lectura (SDK Supabase) ──▶  Supabase (PostgreSQL + RLS)  ◀── inserción
                                                     
GitHub (repositorio) ──▶ Vercel (producción HTTPS)
```

La **inserción** del registro la realiza únicamente N8N (después de clasificar la urgencia), para evitar registros duplicados. El frontend usa el SDK de Supabase solo para **consultar** y mostrar el panel de citas.

## Modelo de datos

Tabla `citas_medicas`:

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID (PK) | Identificador interno |
| codigo_cita | VARCHAR(12) | Código legible para el paciente (ej. `MT-A1B2C3`) |
| paciente_nombre | VARCHAR(120) | Nombre completo |
| documento_id | VARCHAR(15) | Documento de identidad |
| email_paciente | VARCHAR(150) | Correo para el comprobante |
| especialidad | VARCHAR(60) | Especialidad solicitada |
| sintomas_desc | TEXT | Descripción de síntomas |
| nivel_urgencia | VARCHAR(30) | Urgencia Alta / Prioritaria / Consulta General |
| fecha_cita | DATE | Fecha preferida |
| estado | VARCHAR(30) | Pendiente / Confirmada / Atendida |
| creado_en | TIMESTAMPTZ | Fecha de registro |

Vista `citas_publicas` (la única que lee el frontend con la `anon key`): código de cita, nombre abreviado, documento enmascarado, especialidad, nivel de urgencia, prioridad, fecha y estado. **No** expone síntomas ni correo. Script completo en [`supabase/schema.sql`](supabase/schema.sql).

## Requisitos funcionales

- **RF-01 — Registro de cita:** El sistema debe permitir al paciente solicitar una cita ingresando nombre, documento de identidad, correo, especialidad, descripción de síntomas y fecha preferida.
- **RF-02 — Validación de documento y campos:** El sistema debe validar en el cliente que el documento sea numérico de 6 a 10 dígitos, el correo tenga formato válido, la fecha no sea anterior a hoy y los síntomas tengan al menos 10 caracteres, mostrando los errores en el DOM (sin `alert()`).
- **RF-03 — Filtro de especialidades:** El sistema debe ofrecer una lista cerrada de especialidades (Medicina General, Pediatría, Cardiología, Dermatología, Ortopedia, Ginecología) y permitir filtrar el panel de citas por especialidad.
- **RF-04 — Clasificación automática de urgencia:** El sistema debe clasificar cada solicitud en *Urgencia Alta*, *Prioritaria* o *Consulta General* según los síntomas reportados, mediante el flujo de N8N.
- **RF-05 — Comprobante digital:** El sistema debe enviar al paciente un correo con el código de cita, el nivel de urgencia asignado y recomendaciones previas a la consulta.
- **RF-06 — Panel de citas:** El sistema debe mostrar un panel con las citas registradas en Supabase, ordenadas por urgencia y fecha, con indicador visual del nivel de urgencia.

## Requisitos no funcionales

- **RNF-01 — Privacidad de datos clínicos:** El panel público no debe mostrar la descripción de síntomas y debe enmascarar el documento (ej. `****5678`). El frontend solo usa la `anon key` de Supabase; ninguna clave privada se publica en el repositorio.
- **RNF-02 — Disponibilidad y rendimiento:** La aplicación debe estar desplegada en Vercel (HTTPS) y el webhook de N8N debe responder en menos de 3 segundos.
- **RNF-03 — Claridad visual y accesibilidad:** Diseño responsivo (Mobile-First); los niveles de urgencia se distinguen con color **y** etiqueta de texto (no solo color), con contraste legible.
- **RNF-04 — Manejo de errores:** Todas las operaciones de red usan `try/catch` y muestran estados visibles de *Cargando / Éxito / Error*; cero errores en consola.

## Trazabilidad de requisitos

| Requisito | Cómo se cumple | Evidencia |
|---|---|---|
| RF-01 Registro de cita | Formulario en `index.html` con nombre, documento, correo, especialidad, síntomas y fecha; `app.js` envía POST JSON al webhook de N8N. | Mensaje "¡Solicitud registrada!" con código `MT-XXXXXX`; registro en Supabase. |
| RF-02 Validación | Validación en el cliente (`app.js`) con errores en el DOM (0 usos de `alert()`), y de nuevo en el servidor (nodo Code de N8N), que responde 400 con la lista de errores. | Captura de errores bajo los campos; respuesta `400 {status:'error', errores:[...]}`. |
| RF-03 Filtro de especialidades | Lista cerrada en el `<select>` y en un `CHECK` de la BD; el panel filtra con `.eq('especialidad', …)`. | Captura del panel filtrado por especialidad. |
| RF-04 Clasificación de urgencia | Nodo Code "Validar y clasificar urgencia" (palabras clave, sinónimos, negaciones y señales de riesgo) + Switch por nivel. | Ejecución en verde en N8N; casos de prueba con los 3 niveles. |
| RF-05 Comprobante digital | Nodo Gmail con HTML: código, especialidad, fecha, nivel de urgencia, recomendaciones de la ruta y aviso de la línea 123. | Captura del correo recibido. |
| RF-06 Panel de citas | Lectura de la vista `citas_publicas` ordenada por `prioridad` y `fecha_cita`; tarjetas con color y etiqueta por nivel. | Captura del panel con citas de los 3 niveles. |
| RNF-01 Privacidad | RLS activo y tabla `citas_medicas` sin permisos para `anon`; la vista pública enmascara el documento y omite síntomas y correo; las claves secretas solo viven en N8N. | `GET citas_medicas` con clave pública → 401; panel muestra `****1234`. |
| RNF-02 Disponibilidad y rendimiento | Despliegue en Vercel (HTTPS). N8N responde al frontend apenas guarda la cita y envía el correo después. | Respuesta del webhook en ~1,4 s en caliente (la primera petición tras inactividad puede tardar más por el arranque de N8N Cloud). |
| RNF-03 Claridad visual | Diseño mobile-first con Tailwind (`sm:`/`lg:`); niveles con color **y** texto (▲ Urgencia Alta, ● Prioritaria, ■ Consulta General); `aria-live` en los mensajes. | Capturas en escritorio y móvil. |
| RNF-04 Manejo de errores | `try/catch` en las operaciones de red, tiempo límite en el `fetch`, estados Cargando / Éxito / Error. | Consola del navegador sin errores. |

## Decisiones de diseño

- **No se usó la política RLS `FOR ALL USING (true)` de la guía.** Esa política permitiría a cualquiera con la clave pública leer, modificar o borrar datos clínicos, lo que viola el RNF-01. En su lugar, `citas_medicas` queda cerrada para `anon`/`authenticated` y el público solo puede hacer `SELECT` sobre la vista `citas_publicas`.
- **Solo N8N inserta en Supabase**, con su propia credencial de servicio. El frontend envía el formulario al webhook y únicamente lee la vista. Así se evitan registros duplicados (la guía sugería insertar desde el frontend y desde N8N a la vez) y la clasificación no se puede saltar desde el navegador.
- **Validación doble:** en el navegador para dar retroalimentación inmediata y en N8N porque el servidor no debe confiar en el cliente.
- **Clasificador con negaciones y sinónimos:** frases como "no tengo dolor en el pecho" no se clasifican como Urgencia Alta; se reconocen sinónimos ("dolor torácico", "me falta el aire", etc.), señales de riesgo como ideación suicida, y ante la duda se elige el nivel más alto.
- **Escape de HTML en el correo:** el nombre del paciente se escapa (`esc()`) antes de insertarlo en el HTML del comprobante para evitar inyección de código.
- **Respuesta antes del correo:** el nodo *Respond to Webhook* va antes de Gmail para cumplir el RNF-02; si el envío del correo falla, la cita ya quedó guardada.
- **CORS restringido:** el webhook solo acepta llamadas del navegador desde `https://mediturno-smart.vercel.app`.

## Equipo

| Integrante | Usuario GitHub |
|---|---|
| Jonathan Stick | [jonathanStickgb](https://github.com/jonathanStickgb) |
| Natalia Cruz Moreno | [nataliacruzmoreno](https://github.com/nataliacruzmoreno) |
| María Medina | [mariamedina-cmd](https://github.com/mariamedina-cmd) |

## Enlaces

- Repositorio GitHub: https://github.com/jonathanStickgb/mediturno-smart
- Producción (Vercel): https://mediturno-smart.vercel.app
- Webhook N8N (Production URL): https://mediturno-uptc.app.n8n.cloud/webhook/mediturno-cita
- Proyecto Supabase: https://icmzyztpycwoasxudkjd.supabase.co

## Configuración (frontend)

```js
const SUPABASE_URL = 'https://icmzyztpycwoasxudkjd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hOg4LfjON9-kT2s862kcig_GGmzaiTK'; // clave publicable: segura en el navegador
const N8N_WEBHOOK_URL = 'https://mediturno-uptc.app.n8n.cloud/webhook/mediturno-cita';
```

> La clave **secreta** (`sb_secret_...` / `service_role`) solo se usa en N8N y **nunca** se sube al repositorio.

Verificación de seguridad con la clave publicable:
- `GET /rest/v1/citas_publicas` → **200** (lectura permitida)
- `GET /rest/v1/citas_medicas` → **401 permission denied** (datos clínicos protegidos)
- `POST /rest/v1/citas_medicas` → **401 permission denied** (solo N8N puede insertar)
