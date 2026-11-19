// =====================================================================
// MediTurno Smart — Frontend
// - Lectura: SDK de Supabase sobre la vista "citas_publicas" (anon key).
// - Escritura: POST al Webhook de N8N (N8N valida, clasifica e inserta).
//   El frontend NO inserta en Supabase (la anon key no tiene permiso).
// =====================================================================

// ---------- Configuración ----------
const SUPABASE_URL = 'https://icmzyztpycwoasxudkjd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hOg4LfjON9-kT2s862kcig_GGmzaiTK'; // clave publicable: segura en el navegador
const N8N_WEBHOOK_URL = ''; // Pegar la Production URL del webhook (…/webhook/mediturno-cita)

const ESPECIALIDADES = ['Medicina General', 'Pediatría', 'Cardiología', 'Dermatología', 'Ortopedia', 'Ginecología'];
const TIMEOUT_MS = 15000;
const AUTO_REFRESH_MS = 30000;

const NIVELES = {
  'Urgencia Alta':    { icono: '▲', badge: 'bg-red-100 text-red-800',     borde: 'border-l-red-600' },
  'Prioritaria':      { icono: '●', badge: 'bg-amber-100 text-amber-900', borde: 'border-l-amber-500' },
  'Consulta General': { icono: '■', badge: 'bg-green-100 text-green-800', borde: 'border-l-green-600' },
};

// ---------- Cliente Supabase ----------
let supabase = null;
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  // Se informa en el panel; no se interrumpe el formulario.
}

// ---------- Referencias DOM ----------
const $ = (id) => document.getElementById(id);
const form = $('form-cita');
const btnEnviar = $('btn-enviar');
const btnSpinner = $('btn-spinner');
const btnTexto = $('btn-texto');
const estadoForm = $('estado-form');
const estadoPanel = $('estado-panel');
const listaCitas = $('lista-citas');
const filtroEspecialidad = $('filtro-especialidad');
const contadorCitas = $('contador-citas');

// ---------- Utilidades ----------
const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text; // nunca innerHTML con datos externos
  return node;
}

function formatearFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function esFechaReal(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

async function fetchConTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Inicialización de selects ----------
function poblarEspecialidades() {
  const selectForm = $('especialidad');
  for (const esp of ESPECIALIDADES) {
    selectForm.append(new Option(esp, esp));
    filtroEspecialidad.append(new Option(esp, esp));
  }
  $('fecha_cita').min = hoyBogota();
}

// ---------- Validación (RF-02) ----------
function leerFormulario() {
  const v = (id) => $(id).value.trim();
  return {
    paciente_nombre: v('paciente_nombre').replace(/\s+/g, ' '),
    documento_id: v('documento_id'),
    email_paciente: v('email_paciente').toLowerCase(),
    especialidad: v('especialidad'),
    sintomas_desc: v('sintomas_desc'),
    fecha_cita: v('fecha_cita'),
  };
}

function validar(d) {
  const errores = {};
  if (d.paciente_nombre.length < 3 || d.paciente_nombre.length > 120) errores.paciente_nombre = 'Ingrese su nombre completo (3 a 120 caracteres).';
  if (!/^[0-9]{6,10}$/.test(d.documento_id)) errores.documento_id = 'El documento debe ser numérico, de 6 a 10 dígitos.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email_paciente)) errores.email_paciente = 'Ingrese un correo electrónico válido.';
  if (!ESPECIALIDADES.includes(d.especialidad)) errores.especialidad = 'Seleccione una especialidad.';
  if (d.sintomas_desc.length < 10) errores.sintomas_desc = 'Describa sus síntomas (mínimo 10 caracteres).';
  if (!esFechaReal(d.fecha_cita)) errores.fecha_cita = 'Seleccione una fecha válida.';
  else if (d.fecha_cita < hoyBogota()) errores.fecha_cita = 'La fecha no puede ser anterior a hoy.';
  return errores;
}

function mostrarErrorCampo(campo, mensaje) {
  const input = $(campo);
  const msg = $(`error-${campo}`);
  if (!input || !msg) return;
  if (mensaje) {
    msg.textContent = mensaje;
    msg.classList.remove('hidden');
    input.setAttribute('aria-invalid', 'true');
    input.classList.add('border-red-600');
    input.classList.remove('border-slate-300');
  } else {
    msg.textContent = '';
    msg.classList.add('hidden');
    input.removeAttribute('aria-invalid');
    input.classList.remove('border-red-600');
    input.classList.add('border-slate-300');
  }
}

function limpiarErrores() {
  ['paciente_nombre', 'documento_id', 'email_paciente', 'especialidad', 'sintomas_desc', 'fecha_cita']
    .forEach((c) => mostrarErrorCampo(c, ''));
}

// ---------- Estados visibles (RNF-04) ----------
function setCargandoForm(cargando) {
  btnEnviar.disabled = cargando;
  btnSpinner.classList.toggle('hidden', !cargando);
  btnTexto.textContent = cargando ? 'Enviando y clasificando…' : 'Solicitar cita';
}

function estadoFormulario(tipo, titulo, detalle = [], extra = null) {
  const estilos = {
    cargando: 'bg-slate-50 border-slate-300 text-slate-800',
    exito: 'bg-green-50 border-green-300 text-green-900',
    error: 'bg-red-50 border-red-300 text-red-900',
  };
  estadoForm.className = `mt-4 rounded-xl border p-4 text-sm ${estilos[tipo]}`;
  estadoForm.replaceChildren(el('p', 'font-semibold', titulo));
  if (extra) estadoForm.append(extra);
  if (detalle.length) {
    const ul = el('ul', 'list-disc pl-5 mt-2 space-y-1');
    detalle.forEach((t) => ul.append(el('li', '', t)));
    estadoForm.append(ul);
  }
}

function badgeUrgencia(nivel) {
  const cfg = NIVELES[nivel] || NIVELES['Consulta General'];
  return el('span', `inline-block px-2 py-1 rounded-full text-xs font-semibold ${cfg.badge}`, `${cfg.icono} ${nivel}`);
}

// ---------- Envío al webhook de N8N (RF-01, RF-04, RF-05) ----------
async function onSubmit(e) {
  e.preventDefault();
  if (btnEnviar.disabled) return; // evita doble envío

  limpiarErrores();
  const datos = leerFormulario();
  const errores = validar(datos);
  const campos = Object.keys(errores);
  if (campos.length) {
    campos.forEach((c) => mostrarErrorCampo(c, errores[c]));
    estadoFormulario('error', 'Revise los campos marcados.');
    $(campos[0]).focus();
    return;
  }

  if (!N8N_WEBHOOK_URL) {
    estadoFormulario('error', 'El servicio de agendamiento no está configurado.', ['Falta definir N8N_WEBHOOK_URL en app.js.']);
    return;
  }

  setCargandoForm(true);
  estadoFormulario('cargando', 'Enviando solicitud y evaluando urgencia…');

  try {
    const resp = await fetchConTimeout(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });

    let body = null;
    try { body = await resp.json(); } catch { body = null; }

    if (resp.ok && body?.status === 'ok') {
      const tarjeta = el('div', 'mt-3 space-y-2');
      const codigo = el('p', '', 'Código de cita: ');
      codigo.append(el('strong', 'font-mono text-base', body.codigo_cita || '—'));
      const nivel = el('p', '', 'Nivel asignado: ');
      nivel.append(badgeUrgencia(body.clasificacion));
      tarjeta.append(codigo, nivel, el('p', 'text-green-800', `Fecha solicitada: ${formatearFecha(body.fecha_cita)}. Enviamos el comprobante a ${datos.email_paciente}.`));
      if (body.clasificacion === 'Urgencia Alta') {
        tarjeta.append(el('p', 'mt-2 p-2 rounded-lg bg-red-100 text-red-900 font-semibold',
          'Si sus síntomas son graves, no espere la cita: llame a la línea 123 o acuda a urgencias.'));
      }
      estadoFormulario('exito', '¡Solicitud registrada!', [], tarjeta);
      form.reset();
      $('contador-sintomas').textContent = '0';
      cargarCitas();
    } else if (resp.status === 400 && Array.isArray(body?.errores)) {
      estadoFormulario('error', 'El servidor rechazó la solicitud:', body.errores.map(String));
    } else {
      estadoFormulario('error', 'No fue posible registrar la cita.', [`El servidor respondió con código ${resp.status}. Intente de nuevo en unos minutos.`]);
    }
  } catch (err) {
    const msg = err?.name === 'AbortError'
      ? 'El servidor tardó demasiado en responder. Intente de nuevo.'
      : 'No hay conexión con el servicio de agendamiento. Verifique su conexión a internet.';
    estadoFormulario('error', 'No fue posible registrar la cita.', [msg]);
  } finally {
    setCargandoForm(false);
  }
}

// ---------- Panel de citas (RF-03, RF-06) ----------
let cargandoPanel = false;

function estadoDelPanel(tipo, texto) {
  const estilos = {
    cargando: 'text-slate-600',
    vacio: 'text-slate-600 bg-slate-50 border border-dashed border-slate-300',
    error: 'text-red-900 bg-red-50 border border-red-300',
  };
  estadoPanel.className = `rounded-xl p-4 mb-3 text-sm ${estilos[tipo]}`;
  estadoPanel.replaceChildren();
  if (tipo === 'cargando') {
    const fila = el('span', 'inline-flex items-center gap-2');
    fila.append(el('span', 'spinner'), el('span', '', texto));
    estadoPanel.append(fila);
  } else {
    estadoPanel.textContent = texto;
  }
}

function limpiarEstadoPanel() {
  estadoPanel.className = '';
  estadoPanel.replaceChildren();
}

function tarjetaCita(c) {
  const cfg = NIVELES[c.nivel_urgencia] || NIVELES['Consulta General'];
  const li = el('li', `rounded-xl border border-slate-200 border-l-4 ${cfg.borde} p-4 bg-white`);

  const cabecera = el('div', 'flex items-start justify-between gap-2 mb-2');
  cabecera.append(el('span', 'font-mono text-sm font-semibold text-slate-700', c.codigo_cita), badgeUrgencia(c.nivel_urgencia));

  const nombre = el('p', 'font-semibold', c.paciente || '—');
  const doc = el('p', 'text-sm text-slate-600', `Doc. ${c.documento || '—'}`);

  const datos = el('dl', 'mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm');
  [['Especialidad', c.especialidad], ['Fecha', formatearFecha(c.fecha_cita)], ['Estado', c.estado]].forEach(([k, v]) => {
    datos.append(el('dt', 'text-slate-500', k), el('dd', 'text-slate-900', v || '—'));
  });

  li.append(cabecera, nombre, doc, datos);
  return li;
}

async function cargarCitas({ silencioso = false } = {}) {
  if (cargandoPanel) return;
  if (!supabase) {
    estadoDelPanel('error', 'No se pudo inicializar la conexión con la base de datos.');
    return;
  }
  cargandoPanel = true;
  if (!silencioso) estadoDelPanel('cargando', 'Cargando citas…');

  try {
    let query = supabase
      .from('citas_publicas')
      .select('codigo_cita, paciente, documento, especialidad, nivel_urgencia, prioridad, fecha_cita, estado')
      .order('prioridad', { ascending: true })
      .order('fecha_cita', { ascending: true })
      .limit(100);

    const filtro = filtroEspecialidad.value;
    if (filtro) query = query.eq('especialidad', filtro);

    const { data, error } = await query;
    if (error) throw error;

    listaCitas.replaceChildren(...data.map(tarjetaCita));
    contadorCitas.textContent = `${data.length} cita${data.length === 1 ? '' : 's'}${filtro ? ` en ${filtro}` : ''}.`;

    if (data.length === 0) {
      estadoDelPanel('vacio', filtro ? `No hay citas registradas en ${filtro}.` : 'Aún no hay citas registradas.');
    } else {
      limpiarEstadoPanel();
    }
  } catch (err) {
    if (!silencioso) {
      listaCitas.replaceChildren();
      contadorCitas.textContent = '';
    }
    estadoDelPanel('error', 'No fue posible cargar el panel de citas. Intente actualizar en unos segundos.');
  } finally {
    cargandoPanel = false;
  }
}

// ---------- Eventos ----------
function init() {
  poblarEspecialidades();

  form.addEventListener('submit', onSubmit);

  // Limpia el error de un campo cuando el usuario lo corrige
  form.querySelectorAll('.campo').forEach((input) => {
    input.addEventListener('input', () => mostrarErrorCampo(input.id, ''));
  });

  // Solo dígitos en el documento
  $('documento_id').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
  });

  $('sintomas_desc').addEventListener('input', (e) => {
    $('contador-sintomas').textContent = String(e.target.value.length);
  });

  filtroEspecialidad.addEventListener('change', () => cargarCitas());
  $('btn-recargar').addEventListener('click', () => cargarCitas());

  cargarCitas();

  // Actualización periódica (Realtime no aplica sobre vistas)
  setInterval(() => {
    if (document.visibilityState === 'visible') cargarCitas({ silencioso: true });
  }, AUTO_REFRESH_MS);
}

init();
