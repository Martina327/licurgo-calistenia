-- =====================================================================
--  A1 · Gestionar alumnos (CU01, RF01) · Pareja A
--  Datos obligatorios en la clase de prueba y ficha completa al pagar
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261107_02.
--  Es re-ejecutable.
--
--  Decisión del equipo (07/11/2026):
--    · Clase de prueba: nombre, apellido, DNI, celular y EMAIL, todos
--      obligatorios. Sirven para contactar a quien no vuelve (invitación
--      a retomar y, más adelante, promociones).
--    · Al pagar la primera cuota la ficha tiene que estar completa:
--      fecha de nacimiento, domicilio y contacto de emergencia.
--      La regla vive en _extender_membresia, así vale igual para el pago
--      en efectivo (A2) y para la transferencia aprobada (CU08).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Domicilio
-- ---------------------------------------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS domicilio TEXT;
GRANT UPDATE (domicilio) ON public.alumnos TO authenticated;


-- Email con formato válido (devuelve el email normalizado o NULL si viene vacío)
CREATE OR REPLACE FUNCTION public._normalizar_email(p_email TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_email TEXT := nullif(lower(trim(coalesce(p_email, ''))), '');
BEGIN
    IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'EMAIL_INVALIDO: %', v_email;
    END IF;
    RETURN v_email;
END $$;
REVOKE EXECUTE ON FUNCTION public._normalizar_email(TEXT) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Ficha completa
--    Qué le falta a un alumno para poder pagar la primera cuota.
--    Devuelve un arreglo vacío si no le falta nada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._datos_faltantes(p_alumno_id UUID) RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT array_remove(ARRAY[
        CASE WHEN u.email_contacto IS NULL                         THEN 'email' END,
        CASE WHEN a.fecha_nacimiento IS NULL                       THEN 'fecha de nacimiento' END,
        CASE WHEN coalesce(trim(a.domicilio), '') = ''             THEN 'domicilio' END,
        CASE WHEN coalesce(trim(a.contacto_emergencia), '') = ''   THEN 'contacto de emergencia' END
    ], NULL)
      FROM public.usuarios u JOIN public.alumnos a ON a.usuario_id = u.id
     WHERE u.id = p_alumno_id
$$;
REVOKE EXECUTE ON FUNCTION public._datos_faltantes(UUID) FROM PUBLIC, anon, authenticated;


-- _extender_membresia (dueño: Pareja A · la usa también CU08)
-- Misma lógica de siempre (+30 días al vencimiento actual), con un control
-- nuevo: en el PRIMER pago (vencimiento NULL) la ficha tiene que estar completa.
CREATE OR REPLACE FUNCTION public._extender_membresia(p_alumno_id UUID) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actual    date;
    v_faltantes TEXT[];
    v_nuevo     date;
BEGIN
    SELECT fecha_vencimiento INTO v_actual FROM public.alumnos WHERE usuario_id = p_alumno_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', p_alumno_id;
    END IF;

    IF v_actual IS NULL THEN
        v_faltantes := public._datos_faltantes(p_alumno_id);
        IF cardinality(v_faltantes) > 0 THEN
            RAISE EXCEPTION 'FICHA_INCOMPLETA: %', array_to_string(v_faltantes, ', ');
        END IF;
    END IF;

    UPDATE public.alumnos
       SET fecha_vencimiento = coalesce(fecha_vencimiento, public.hoy_ar()) + 30
     WHERE usuario_id = p_alumno_id
    RETURNING fecha_vencimiento INTO v_nuevo;
    RETURN v_nuevo;
END $$;


-- ---------------------------------------------------------------------
-- 3. v_membresias: columnas nuevas AL FINAL (no cambia lo que ya usa B)
--      email, domicilio y datos_faltantes
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
    a.fecha_clase_prueba,
    u.email_contacto                           AS email,
    a.domicilio,
    array_remove(ARRAY[
        CASE WHEN u.email_contacto IS NULL                       THEN 'email' END,
        CASE WHEN a.fecha_nacimiento IS NULL                     THEN 'fecha de nacimiento' END,
        CASE WHEN coalesce(trim(a.domicilio), '') = ''           THEN 'domicilio' END,
        CASE WHEN coalesce(trim(a.contacto_emergencia), '') = '' THEN 'contacto de emergencia' END
    ], NULL)                                   AS datos_faltantes
FROM public.usuarios u
JOIN public.alumnos a        ON a.usuario_id = u.id
LEFT JOIN public.planes p    ON p.id = a.plan_id
LEFT JOIN LATERAL (
    SELECT ca.fecha_vencimiento FROM public.certificados_aptos ca
     WHERE ca.alumno_id = u.id ORDER BY ca.fecha_vencimiento DESC LIMIT 1
) c ON TRUE
WHERE u.activo;


-- ---------------------------------------------------------------------
-- 4. Alta de clase de prueba: ahora con EMAIL obligatorio
--    (reemplaza a la versión de 4 parámetros de la migración 01)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.alta_clase_prueba(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.alta_clase_prueba(
    p_dni      TEXT,
    p_nombre   TEXT,
    p_apellido TEXT,
    p_telefono TEXT,
    p_email    TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE
    v_dni      TEXT := regexp_replace(coalesce(p_dni, ''), '[.\s]', '', 'g');
    v_nombre   TEXT := trim(coalesce(p_nombre, ''));
    v_apellido TEXT := trim(coalesce(p_apellido, ''));
    v_telefono TEXT := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
    v_email    TEXT := public._normalizar_email(p_email);
    v_login    TEXT;
    v_id       UUID := gen_random_uuid();
    v_activo   BOOLEAN;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');

    IF v_dni !~ '^[0-9]{7,8}$' THEN
        RAISE EXCEPTION 'DNI_INVALIDO: %', v_dni;
    END IF;
    IF v_nombre = '' OR v_apellido = '' THEN
        RAISE EXCEPTION 'DATOS_REQUERIDOS: nombre y apellido';
    END IF;
    IF length(v_telefono) < 10 THEN
        RAISE EXCEPTION 'CELULAR_INVALIDO: %', p_telefono;
    END IF;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'EMAIL_REQUERIDO';
    END IF;

    SELECT activo INTO v_activo FROM public.usuarios WHERE dni = v_dni;
    IF FOUND THEN
        IF v_activo THEN
            RAISE EXCEPTION 'DNI_EXISTENTE: %', v_dni;
        ELSE
            RAISE EXCEPTION 'DNI_DADO_DE_BAJA: %', v_dni;
        END IF;
    END IF;

    v_login := v_dni || '@licurgo.test';
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_login) THEN
        RAISE EXCEPTION 'DNI_EXISTENTE: %', v_dni;
    END IF;

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, email_change,
                            email_change_token_new, recovery_token, email_change_token_current,
                            phone_change, phone_change_token, reauthentication_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
            v_login, extensions.crypt(v_dni, extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                               'rol', 'Alumno'),
            jsonb_build_object('dni', v_dni, 'nombre', v_nombre, 'apellido', v_apellido,
                               'telefono', v_telefono, 'email_contacto', v_email,
                               'plan_id', public._plan_unico()),
            now(), now(), '', '', '', '', '', '', '', '');

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', v_login, 'email_verified', true),
            'email', NULL, now(), now());

    UPDATE public.usuarios SET debe_cambiar_clave = TRUE WHERE id = v_id;
    RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.alta_clase_prueba(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.alta_clase_prueba(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 5. Editar alumno: suma domicilio y aplica las reglas nuevas
--      · email obligatorio para todos
--      · si ya pagó alguna vez, la ficha tiene que quedar completa
--      · si está en clase de prueba, la ficha se puede ir completando
--    (reemplaza a la versión de 8 parámetros de la migración 02)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.editar_alumno(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.editar_alumno(
    p_alumno_id           UUID,
    p_dni                 TEXT,
    p_nombre              TEXT,
    p_apellido            TEXT,
    p_telefono            TEXT,
    p_email_contacto      TEXT,
    p_fecha_nacimiento    DATE DEFAULT NULL,
    p_domicilio           TEXT DEFAULT NULL,
    p_contacto_emergencia TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
    v_dni_actual  TEXT;
    v_dni         TEXT := regexp_replace(coalesce(p_dni, ''), '[.\s]', '', 'g');
    v_nombre      TEXT := trim(coalesce(p_nombre, ''));
    v_apellido    TEXT := trim(coalesce(p_apellido, ''));
    v_telefono    TEXT := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
    v_email       TEXT := public._normalizar_email(p_email_contacto);
    v_domicilio   TEXT := nullif(trim(coalesce(p_domicilio, '')), '');
    v_emergencia  TEXT := nullif(trim(coalesce(p_contacto_emergencia, '')), '');
    v_ya_pago     BOOLEAN;
    v_login       TEXT;
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
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'EMAIL_REQUERIDO';
    END IF;
    IF p_fecha_nacimiento IS NOT NULL
       AND (p_fecha_nacimiento > public.hoy_ar() OR p_fecha_nacimiento < DATE '1900-01-01') THEN
        RAISE EXCEPTION 'FECHA_NACIMIENTO_INVALIDA: %', p_fecha_nacimiento;
    END IF;

    SELECT fecha_vencimiento IS NOT NULL INTO v_ya_pago
      FROM public.alumnos WHERE usuario_id = p_alumno_id;
    IF v_ya_pago AND (p_fecha_nacimiento IS NULL OR v_domicilio IS NULL OR v_emergencia IS NULL) THEN
        RAISE EXCEPTION 'FICHA_INCOMPLETA: fecha de nacimiento, domicilio y contacto de emergencia';
    END IF;

    IF v_dni <> v_dni_actual THEN
        IF EXISTS (SELECT 1 FROM public.usuarios WHERE dni = v_dni) THEN
            RAISE EXCEPTION 'DNI_EXISTENTE: %', v_dni;
        END IF;
        v_login := v_dni || '@licurgo.test';
        IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_login) THEN
            RAISE EXCEPTION 'DNI_EXISTENTE: %', v_dni;
        END IF;
        UPDATE auth.users
           SET email = v_login,
               raw_user_meta_data = raw_user_meta_data || jsonb_build_object('dni', v_dni),
               updated_at = now()
         WHERE id = p_alumno_id;
        UPDATE auth.identities
           SET identity_data = identity_data || jsonb_build_object('email', v_login),
               updated_at = now()
         WHERE user_id = p_alumno_id AND provider = 'email';
    END IF;

    UPDATE public.usuarios
       SET dni = v_dni, nombre = v_nombre, apellido = v_apellido,
           telefono = v_telefono, email_contacto = v_email
     WHERE id = p_alumno_id;

    UPDATE public.alumnos
       SET fecha_nacimiento    = p_fecha_nacimiento,
           domicilio           = v_domicilio,
           contacto_emergencia = v_emergencia
     WHERE usuario_id = p_alumno_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.editar_alumno(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.editar_alumno(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 6. Verificación: qué le falta a cada alumno
-- ---------------------------------------------------------------------
SELECT nombre, apellido, estado_alumno, email, datos_faltantes
  FROM public.v_membresias ORDER BY estado_alumno, apellido;
