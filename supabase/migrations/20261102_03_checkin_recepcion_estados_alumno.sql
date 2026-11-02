-- =====================================================================
--  Check-in solo por recepción · estados del alumno · invitaciones a retomar
--  Correr en el SQL Editor de Supabase sobre el esquema v2 ya cargado.
--  Es re-ejecutable. (Ya incluido en supabase/schema.sql.)
--
--  Decisiones del equipo (01/11/2026):
--    · La asistencia la marca SOLO recepción (o el SuperAdmin), no el alumno.
--    · Cuota vencida: se avisa en pantalla, pero NO se bloquea el ingreso.
--    · El check-in guarda fecha y hora (para las franjas de mayor flujo, CU13).
--    · Estados del alumno:
--        En clase de prueba → se registró con nombre, DNI y celular, todavía no pagó
--        Activo             → pagó al menos una cuota
--        Inactivo           → su cuota venció hace más de 30 días
--    · Invitación a retomar (WhatsApp manual desde recepción):
--        - clase de prueba sin pagar, 7 días después
--        - alumnos inactivos
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Fecha de la clase de prueba
-- ---------------------------------------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS fecha_clase_prueba DATE;
UPDATE public.alumnos SET fecha_clase_prueba = fecha_alta WHERE fecha_clase_prueba IS NULL;
ALTER TABLE public.alumnos
    ALTER COLUMN fecha_clase_prueba SET DEFAULT public.hoy_ar(),
    ALTER COLUMN fecha_clase_prueba SET NOT NULL;

-- Recepción puede corregirla (el RLS de alumnos ya limita el UPDATE a Recepción/SuperAdmin)
GRANT UPDATE (fecha_clase_prueba) ON public.alumnos TO authenticated;


-- ---------------------------------------------------------------------
-- 2. Estado del alumno en v_membresias (columnas nuevas al final)
--    Se calcula, no se guarda: no hace falta ninguna tarea programada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_membresias WITH (security_invoker = true) AS
SELECT
    u.id                                       AS alumno_id,
    u.dni, u.nombre, u.apellido, u.telefono,
    p.id                                       AS plan_id,
    p.nombre                                   AS plan,
    p.precio                                   AS precio_plan,
    a.fecha_vencimiento,
    a.fecha_vencimiento - public.hoy_ar()      AS dias_restantes,
    CASE
        WHEN a.fecha_vencimiento IS NULL                     THEN 'Sin membresía'
        WHEN a.fecha_vencimiento <  public.hoy_ar()          THEN 'Vencida'
        WHEN a.fecha_vencimiento <= public.hoy_ar() + 3      THEN 'Por vencer'
        ELSE 'Al día'
    END                                        AS estado_membresia,
    c.fecha_vencimiento                        AS certificado_vencimiento,
    CASE
        WHEN c.fecha_vencimiento IS NULL                     THEN 'Sin certificado'
        WHEN c.fecha_vencimiento <  public.hoy_ar()          THEN 'Vencido'
        WHEN c.fecha_vencimiento <= public.hoy_ar() + 15     THEN 'Por vencer'
        ELSE 'Vigente'
    END                                        AS estado_certificado,
    CASE
        WHEN a.fecha_vencimiento IS NULL                     THEN 'En clase de prueba'
        WHEN a.fecha_vencimiento <  public.hoy_ar() - 30     THEN 'Inactivo'
        ELSE 'Activo'
    END                                        AS estado_alumno,
    a.fecha_clase_prueba
FROM public.usuarios u
JOIN public.alumnos a        ON a.usuario_id = u.id
LEFT JOIN public.planes p    ON p.id = a.plan_id
LEFT JOIN LATERAL (
    SELECT ca.fecha_vencimiento FROM public.certificados_aptos ca
     WHERE ca.alumno_id = u.id ORDER BY ca.fecha_vencimiento DESC LIMIT 1
) c ON TRUE
WHERE u.activo;

-- Alertas de vencimiento: solo alumnos activos (los inactivos pasan a invitaciones)
CREATE OR REPLACE VIEW public.v_alertas WITH (security_invoker = true) AS
SELECT alumno_id, dni, nombre, apellido, telefono, 'Membresía'::text AS tipo,
       estado_membresia AS estado, fecha_vencimiento AS vence, dias_restantes
  FROM public.v_membresias
 WHERE estado_alumno = 'Activo'
   AND estado_membresia IN ('Por vencer', 'Vencida')
UNION ALL
SELECT alumno_id, dni, nombre, apellido, telefono, 'Certificado',
       estado_certificado, certificado_vencimiento,
       certificado_vencimiento - public.hoy_ar()
  FROM public.v_membresias
 WHERE estado_alumno <> 'Inactivo'
   AND estado_certificado IN ('Por vencer', 'Vencido', 'Sin certificado');


-- ---------------------------------------------------------------------
-- 3. Check-in (CU03): solo Recepción / SuperAdmin, sin bloqueo por cuota
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_checkin(UUID);

CREATE FUNCTION public.registrar_checkin(p_alumno_id UUID)
RETURNS public.asistencias
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_row public.asistencias;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    IF p_alumno_id IS NULL THEN
        RAISE EXCEPTION 'ALUMNO_REQUERIDO';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.alumnos a JOIN public.usuarios u ON u.id = a.usuario_id
                    WHERE a.usuario_id = p_alumno_id AND u.activo) THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', p_alumno_id;
    END IF;

    -- Cuota vencida: NO se bloquea. Recepción ve el aviso en pantalla (v_membresias).
    INSERT INTO public.asistencias (alumno_id, registrado_por)
    VALUES (p_alumno_id, auth.uid())
    ON CONFLICT (alumno_id, fecha) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN   -- ya tenía presente hoy: devolvemos el registro existente
        SELECT * INTO v_row FROM public.asistencias
         WHERE alumno_id = p_alumno_id AND fecha = public.hoy_ar();
    END IF;
    RETURN v_row;
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_checkin(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_checkin(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 4. Invitaciones a retomar
--    Recepción abre WhatsApp con el mensaje armado, lo envía a mano y
--    marca la invitación como enviada para que no vuelva a aparecer.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitaciones_retomar (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id    UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    motivo       TEXT NOT NULL CHECK (motivo IN ('Clase de prueba', 'Inactivo')),
    enviada_por  UUID NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id),
    enviada_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitaciones_alumno ON public.invitaciones_retomar (alumno_id, enviada_at DESC);

ALTER TABLE public.invitaciones_retomar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitaciones_select ON public.invitaciones_retomar;
CREATE POLICY invitaciones_select ON public.invitaciones_retomar FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));
REVOKE INSERT, UPDATE, DELETE ON public.invitaciones_retomar FROM anon, authenticated;

-- Pendientes de invitar:
--   · en clase de prueba hace 7 días o más, sin pagar y sin invitación previa
--   · inactivos que no fueron invitados desde que pasaron a inactivos
CREATE OR REPLACE VIEW public.v_invitaciones_pendientes WITH (security_invoker = true) AS
SELECT m.alumno_id, m.dni, m.nombre, m.apellido, m.telefono,
       CASE m.estado_alumno WHEN 'En clase de prueba' THEN 'Clase de prueba' ELSE 'Inactivo' END AS motivo,
       CASE m.estado_alumno WHEN 'En clase de prueba' THEN m.fecha_clase_prueba
                            ELSE m.fecha_vencimiento END                                     AS desde,
       public.hoy_ar() - CASE m.estado_alumno WHEN 'En clase de prueba' THEN m.fecha_clase_prueba
                                              ELSE m.fecha_vencimiento END                   AS dias,
       i.ultima                                                                              AS ultima_invitacion
  FROM public.v_membresias m
  LEFT JOIN LATERAL (
      SELECT max(ir.enviada_at) AS ultima FROM public.invitaciones_retomar ir
       WHERE ir.alumno_id = m.alumno_id
  ) i ON TRUE
 WHERE public.mi_rol() IN ('Recepcionista', 'SuperAdmin')
   AND (
        (m.estado_alumno = 'En clase de prueba'
            AND m.fecha_clase_prueba <= public.hoy_ar() - 7
            AND i.ultima IS NULL)
     OR (m.estado_alumno = 'Inactivo'
            AND (i.ultima IS NULL
                 OR (i.ultima AT TIME ZONE 'America/Argentina/Buenos_Aires')::date < m.fecha_vencimiento + 30))
   );

CREATE OR REPLACE FUNCTION public.registrar_invitacion(p_alumno_id UUID, p_motivo TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    INSERT INTO public.invitaciones_retomar (alumno_id, motivo)
    VALUES (p_alumno_id, p_motivo)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_invitacion(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_invitacion(UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 5. Datos de prueba
-- ---------------------------------------------------------------------
-- La asistencia mock de Lucía figuraba como marcada por ella misma: pasa a recepción.
UPDATE public.asistencias
   SET registrado_por = '10000000-0000-0000-0000-000000000002'
 WHERE registrado_por = alumno_id;

-- Valentina: vino a clase de prueba hace 8 días y no pagó → invitación pendiente
-- Diego: su cuota venció hace 40 días → inactivo, invitación pendiente
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '20000000-0000-0000-0000-000000000004') THEN
        PERFORM public._crear_usuario_mock('20000000-0000-0000-0000-000000000004', '43444004',
                                           'Valentina', 'Sosa', 'Alumno', '3815552004');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '20000000-0000-0000-0000-000000000005') THEN
        PERFORM public._crear_usuario_mock('20000000-0000-0000-0000-000000000005', '38555005',
                                           'Diego', 'Luna', 'Alumno', '3815552005',
                                           'a0000000-0000-0000-0000-000000000001');
    END IF;
END $$;

UPDATE public.alumnos SET fecha_clase_prueba = public.hoy_ar() - 8
 WHERE usuario_id = '20000000-0000-0000-0000-000000000004';
UPDATE public.alumnos SET fecha_clase_prueba = public.hoy_ar() - 100,
                          fecha_vencimiento  = public.hoy_ar() - 40
 WHERE usuario_id = '20000000-0000-0000-0000-000000000005';


-- ---------------------------------------------------------------------
-- 6. Verificación
-- ---------------------------------------------------------------------
SELECT nombre, apellido, estado_alumno, estado_membresia, dias_restantes
  FROM public.v_membresias ORDER BY estado_alumno, dias_restantes;
