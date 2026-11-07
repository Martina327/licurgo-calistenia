-- =====================================================================
--  A1 · Gestionar alumnos (CU01, RF01) · Pareja A
--  Edición, baja lógica y reactivación de alumnos
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261107_01.
--  Es re-ejecutable.
--
--  Todo pasa por funciones (como el cobro o el check-in) para que nadie
--  pueda cambiar a mano el DNI, el rol o la marca de activo desde el front:
--    · editar_alumno     → datos personales y DNI (si cambia el DNI,
--                          también cambia el usuario con el que entra)
--    · dar_baja_alumno   → baja lógica: activo = false. No se borra nada,
--                          porque tiene pagos y asistencias asociados.
--                          Ya no puede entrar a la app (AuthContext lo saca).
--    · reactivar_alumno  → vuelve a activo = true
--    · v_alumnos_baja    → listado de dados de baja (v_membresias solo
--                          muestra activos)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Proteger la tabla usuarios
--    Las políticas RLS ya limitaban QUIÉN edita; esto limita QUÉ se edita.
--    Desde el front no se puede tocar ninguna columna: se usan las funciones.
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.usuarios FROM anon, authenticated;


-- Valida que el id corresponda a un alumno (activo o no) y devuelve su DNI
CREATE OR REPLACE FUNCTION public._alumno_existente(p_alumno_id UUID) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dni TEXT;
BEGIN
    SELECT u.dni INTO v_dni
      FROM public.usuarios u JOIN public.alumnos a ON a.usuario_id = u.id
     WHERE u.id = p_alumno_id AND u.rol = 'Alumno';
    IF v_dni IS NULL THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', p_alumno_id;
    END IF;
    RETURN v_dni;
END $$;
REVOKE EXECUTE ON FUNCTION public._alumno_existente(UUID) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Editar alumno (CU01 · modificación)
--    Nombre, apellido y DNI son obligatorios; el resto puede ir vacío.
--    Si cambia el DNI se actualiza también el email interno de login.
--    La clave NO cambia: si el alumno todavía tenía el DNI viejo como
--    clave, la sigue usando hasta que la cambie.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.editar_alumno(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT);

CREATE FUNCTION public.editar_alumno(
    p_alumno_id           UUID,
    p_dni                 TEXT,
    p_nombre              TEXT,
    p_apellido            TEXT,
    p_telefono            TEXT,
    p_email_contacto      TEXT DEFAULT NULL,
    p_fecha_nacimiento    DATE DEFAULT NULL,
    p_contacto_emergencia TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
    v_dni_actual TEXT;
    v_dni        TEXT := regexp_replace(coalesce(p_dni, ''), '[.\s]', '', 'g');
    v_nombre     TEXT := trim(coalesce(p_nombre, ''));
    v_apellido   TEXT := trim(coalesce(p_apellido, ''));
    v_telefono   TEXT := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
    v_email      TEXT := nullif(lower(trim(coalesce(p_email_contacto, ''))), '');
    v_email_login TEXT;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    v_dni_actual := public._alumno_existente(p_alumno_id);

    IF v_dni !~ '^[0-9]{7,8}$' THEN
        RAISE EXCEPTION 'DNI_INVALIDO: %', v_dni;
    END IF;
    IF v_nombre = '' OR v_apellido = '' THEN
        RAISE EXCEPTION 'DATOS_REQUERIDOS: nombre y apellido';
    END IF;
    IF length(v_telefono) < 10 THEN
        RAISE EXCEPTION 'CELULAR_INVALIDO: %', p_telefono;
    END IF;
    IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'EMAIL_INVALIDO: %', v_email;
    END IF;
    IF p_fecha_nacimiento IS NOT NULL
       AND (p_fecha_nacimiento > public.hoy_ar() OR p_fecha_nacimiento < DATE '1900-01-01') THEN
        RAISE EXCEPTION 'FECHA_NACIMIENTO_INVALIDA: %', p_fecha_nacimiento;
    END IF;

    -- Cambio de DNI: tiene que ser único y se mueve también el login
    IF v_dni <> v_dni_actual THEN
        IF EXISTS (SELECT 1 FROM public.usuarios WHERE dni = v_dni) THEN
            RAISE EXCEPTION 'DNI_EXISTENTE: %', v_dni;
        END IF;
        v_email_login := v_dni || '@licurgo.test';
        IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email_login) THEN
            RAISE EXCEPTION 'DNI_EXISTENTE: %', v_dni;
        END IF;

        UPDATE auth.users
           SET email = v_email_login,
               raw_user_meta_data = raw_user_meta_data || jsonb_build_object('dni', v_dni),
               updated_at = now()
         WHERE id = p_alumno_id;
        UPDATE auth.identities
           SET identity_data = identity_data || jsonb_build_object('email', v_email_login),
               updated_at = now()
         WHERE user_id = p_alumno_id AND provider = 'email';
    END IF;

    UPDATE public.usuarios
       SET dni = v_dni, nombre = v_nombre, apellido = v_apellido,
           telefono = v_telefono, email_contacto = v_email
     WHERE id = p_alumno_id;

    UPDATE public.alumnos
       SET fecha_nacimiento    = p_fecha_nacimiento,
           contacto_emergencia = nullif(trim(coalesce(p_contacto_emergencia, '')), '')
     WHERE usuario_id = p_alumno_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.editar_alumno(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.editar_alumno(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 3. Baja lógica y reactivación
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dar_baja_alumno(p_alumno_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    PERFORM public._alumno_existente(p_alumno_id);
    UPDATE public.usuarios SET activo = FALSE WHERE id = p_alumno_id;
END $$;

CREATE OR REPLACE FUNCTION public.reactivar_alumno(p_alumno_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    PERFORM public._alumno_existente(p_alumno_id);
    UPDATE public.usuarios SET activo = TRUE WHERE id = p_alumno_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.dar_baja_alumno(UUID), public.reactivar_alumno(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dar_baja_alumno(UUID), public.reactivar_alumno(UUID) TO authenticated;


-- Dados de baja (v_membresias filtra WHERE u.activo)
CREATE OR REPLACE VIEW public.v_alumnos_baja WITH (security_invoker = true) AS
SELECT u.id AS alumno_id, u.dni, u.nombre, u.apellido, u.telefono,
       a.fecha_vencimiento, a.fecha_alta
  FROM public.usuarios u
  JOIN public.alumnos a ON a.usuario_id = u.id
 WHERE NOT u.activo
   AND public.mi_rol() IN ('Recepcionista', 'SuperAdmin');

GRANT SELECT ON public.v_alumnos_baja TO authenticated;


-- ---------------------------------------------------------------------
-- 4. Verificación: tienen que aparecer las 4 funciones nuevas
-- ---------------------------------------------------------------------
SELECT proname FROM pg_proc
 WHERE proname IN ('editar_alumno', 'dar_baja_alumno', 'reactivar_alumno', '_alumno_existente')
 ORDER BY proname;
