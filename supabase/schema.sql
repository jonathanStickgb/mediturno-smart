-- =====================================================================
-- MediTurno Smart — Esquema de base de datos (Supabase / PostgreSQL)
-- Caso 2: Sector Hospitalario y Salud
-- Ejecutar completo en: Supabase -> SQL Editor -> New query -> Run
-- =====================================================================

-- 1) Tabla principal ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.citas_medicas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_cita     VARCHAR(12) UNIQUE NOT NULL
                    DEFAULT ('MT-' || upper(substr(md5(random()::text), 1, 6))),
    paciente_nombre VARCHAR(120) NOT NULL,
    documento_id    VARCHAR(15)  NOT NULL
                    CHECK (documento_id ~ '^[0-9]{6,10}$'),
    email_paciente  VARCHAR(150) NOT NULL
                    CHECK (email_paciente ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    especialidad    VARCHAR(60)  NOT NULL
                    CHECK (especialidad IN ('Medicina General', 'Pediatría', 'Cardiología',
                                            'Dermatología', 'Ortopedia', 'Ginecología')),
    sintomas_desc   TEXT NOT NULL
                    CHECK (char_length(sintomas_desc) >= 10),
    nivel_urgencia  VARCHAR(30)  NOT NULL DEFAULT 'Consulta General'
                    CHECK (nivel_urgencia IN ('Urgencia Alta', 'Prioritaria', 'Consulta General')),
    fecha_cita      DATE NOT NULL,
    estado          VARCHAR(30)  NOT NULL DEFAULT 'Pendiente'
                    CHECK (estado IN ('Pendiente', 'Confirmada', 'Atendida', 'Cancelada')),
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citas_urgencia ON public.citas_medicas (nivel_urgencia);
CREATE INDEX IF NOT EXISTS idx_citas_fecha    ON public.citas_medicas (fecha_cita);

-- 2) Seguridad: RLS activado y SIN acceso directo para el público -----
--    (RNF-01 Privacidad de datos clínicos)
--    - La tabla con datos sensibles NO es accesible con la anon key.
--    - N8N inserta usando la service_role key (omite RLS), desde el servidor.
ALTER TABLE public.citas_medicas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.citas_medicas FROM anon, authenticated;

-- 3) Vista pública para el panel del frontend --------------------------
--    Solo expone campos no sensibles: sin síntomas, sin email,
--    documento enmascarado y nombre abreviado.
CREATE OR REPLACE VIEW public.citas_publicas AS
SELECT
    codigo_cita,
    split_part(paciente_nombre, ' ', 1) || ' ' ||
        COALESCE(left(NULLIF(split_part(paciente_nombre, ' ', 2), ''), 1) || '.', '')
        AS paciente,
    '****' || right(documento_id, 4)      AS documento,
    especialidad,
    nivel_urgencia,
    CASE nivel_urgencia
        WHEN 'Urgencia Alta' THEN 1
        WHEN 'Prioritaria'   THEN 2
        ELSE 3
    END                                   AS prioridad,
    fecha_cita,
    estado,
    creado_en
FROM public.citas_medicas;

GRANT SELECT ON public.citas_publicas TO anon, authenticated;

-- 4) (Opcional) Registro de prueba para verificar ----------------------
-- INSERT INTO public.citas_medicas
--   (paciente_nombre, documento_id, email_paciente, especialidad, sintomas_desc, nivel_urgencia, fecha_cita)
-- VALUES
--   ('Paciente Prueba', '1234567890', 'prueba@example.com', 'Medicina General',
--    'Dolor de cabeza leve desde ayer', 'Consulta General', CURRENT_DATE + 2);
-- SELECT * FROM public.citas_publicas ORDER BY prioridad, fecha_cita;
