# MediTurno Smart — Triaje Automatizado

Taller práctico **Sistemas Full-Stack y Automatización con Google Antigravity, Supabase y N8N** — UPTC, Programación II.

**Caso de estudio 2 — Sector Hospitalario y Salud**

## Problemática

Una clínica ambulatoria presenta congestión en su línea telefónica y demoras en la asignación de citas prioritarias porque los pacientes no son filtrados según la urgencia de sus síntomas antes de agendar.

## Alcance

Portal web de agendamiento médico con persistencia en Supabase y un flujo automatizado en N8N que evalúa el nivel de urgencia reportado, asigna prioridad de atención y envía un comprobante digital al paciente.

> ⚠️ Proyecto académico. La clasificación de urgencia es orientativa y no reemplaza la valoración de un profesional de la salud. En caso de emergencia, comuníquese con la línea **123**.

## Arquitectura

```
Frontend (HTML + Tailwind + JS)  ──POST JSON──▶  N8N (Webhook → Clasificación → Supabase → Email → Respond)
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

## Equipo

1.
2.
3.

## Enlaces

- Repositorio GitHub: _pendiente_
- Producción (Vercel): _pendiente_
- Proyecto Supabase: https://icmzyztpycwoasxudkjd.supabase.co

## Configuración (frontend)

```js
const SUPABASE_URL = 'https://icmzyztpycwoasxudkjd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hOg4LfjON9-kT2s862kcig_GGmzaiTK'; // clave publicable: segura en el navegador
const N8N_WEBHOOK_URL = ''; // pendiente (Fase 3)
```

> La clave **secreta** (`sb_secret_...` / `service_role`) solo se usa en N8N y **nunca** se sube al repositorio.

Verificación de seguridad con la clave publicable:
- `GET /rest/v1/citas_publicas` → **200** (lectura permitida)
- `GET /rest/v1/citas_medicas` → **401 permission denied** (datos clínicos protegidos)
- `POST /rest/v1/citas_medicas` → **401 permission denied** (solo N8N puede insertar)
