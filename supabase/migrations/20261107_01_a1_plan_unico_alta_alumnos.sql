-- =====================================================================
--  A1 · Gestionar alumnos (CU01, RF01) · Pareja A
--  Plan único · alta rápida de clase de prueba · cambio de clave obligatorio
--
--  Correr en el SQL Editor de Supabase sobre la base que ya tiene
--  las migraciones 20261102_01 a 04. Es re-ejecutable.
--
--  Decisiones del equipo (01/11/2026):
--    · Un solo plan mensual. La tabla planes queda con una fila para que
--      el SuperAdmin pueda cambiar el precio.
--    · En la clase de prueba se piden nombre, DNI y celular. El alumno
--      queda "En clase de prueba" hasta que paga la primera cuota.
--    · El alumno entra con su DNI y está obligado a cambiar la clave en
--      el primer ingreso (la clave inicial es su DNI).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Plan único
--    Se conserva el plan a0000000-...-0001 (lo usa el seed) y se lo
--    renombra. Todos los alumnos quedan con ese plan y se borran los demás.
--    Precio actual de la cuota: $60.000 (después lo cambia el SuperAdmin).
-- ---------------------------------------------------------------------
INSERT INTO public.planes (id, nombre, precio, dias_por_semana)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Plan mensual', 60000, NULL)
ON CONFLICT (id) DO NOTHING;

UPDATE public.planes
   SET nombre = 'Plan mensual', precio = 60000, dias_por_semana = NULL, activo = TRUE
 WHERE id = 'a0000000-0000-0000-0000-000000000001';

UPDATE public.alumnos
   SET plan_id = 'a0000000-0000-0000-0000-000000000001'
 WHERE plan_id IS DISTINCT FROM 'a0000000-0000-0000-0000-000000000001';

DELETE FROM public.planes
 WHERE id <> 'a0000000-0000-0000-0000-000000000001';

-- Devuelve el id del plan único (para no repetir el UUID en las funciones)
CREATE OR REPLACE FUNCTION public._plan_unico() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM public.planes WHERE activo ORDER BY nombre LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public._plan_unico() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Cambio de clave obligatorio en el primer ingreso
--    El front lee esta marca al iniciar sesión y, si está en TRUE,
--    manda al alumno a la pantalla de cambio de clave.
-- ---------------------------------------------------------------------
ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS debe_cambiar_clave BOOLEAN NOT NULL DEFAULT FALSE;

-- El usuario la apaga después de cambiar su clave (solo la suya)
CREATE OR REPLACE FUNCTION public.marcar_clave_cambiada()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'PERMISO_DENEGADO: sesión requerida' USING ERRCODE = '42501';
    END IF;
    UPDATE public.usuarios SET debe_cambiar_clave = FALSE WHERE id = auth.uid();
END $$;
REVOKE EXECUTE ON FUNCTION public.marcar_clave_cambiada() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.marcar_clave_cambiada() TO authenticated;


-- ---------------------------------------------------------------------
-- 3. Alta rápida de clase de prueba (CU01)
--    Solo Recepción / SuperAdmin. Crea la cuenta en Supabase Auth
--    (el trigger fn_nuevo_usuario_auth crea usuarios + alumnos) y
--    devuelve el id del alumno nuevo.
--      · login:  DNI (email interno <dni>@licurgo.test)
--      · clave:  el DNI, con cambio obligatorio en el primer ingreso
--      · estado: En clase de prueba (fecha_vencimiento NULL)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alta_clase_prueba(
    p_dni      TEXT,
    p_nombre   TEXT,
    p_apellido TEXT,
    p_telefono TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE
    v_dni      TEXT := trim(coalesce(p_dni, ''));
    v_nombre   TEXT := trim(coalesce(p_nombre, ''));
    v_apellido TEXT := trim(coalesce(p_apellido, ''));
    v_telefono TEXT := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
    v_email    TEXT;
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

    -- DNI repetido: distinguimos si la persona fue dada de baja
    SELECT activo INTO v_activo FROM public.usuarios WHERE dni = v_dni;
    IF FOUND THEN
        IF v_activo THEN
            RAISE EXCEPTION 'DNI_EXISTENTE: %', v_dni;
        ELSE
            RAISE EXCEPTION 'DNI_DADO_DE_BAJA: %', v_dni;
        END IF;
    END IF;

    v_email := v_dni || '@licurgo.test';
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
        RAISE EXCEPTION 'DNI_EXISTENTE: %', v_dni;
    END IF;

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, email_change,
                            email_change_token_new, recovery_token, email_change_token_current,
                            phone_change, phone_change_token, reauthentication_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
            v_email, extensions.crypt(v_dni, extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                               'rol', 'Alumno'),
            jsonb_build_object('dni', v_dni, 'nombre', v_nombre, 'apellido', v_apellido,
                               'telefono', v_telefono, 'plan_id', public._plan_unico()),
            now(), now(), '', '', '', '', '', '', '', '');

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
            'email', NULL, now(), now());

    -- El trigger ya creó usuarios + alumnos: marcamos el cambio de clave obligatorio
    UPDATE public.usuarios SET debe_cambiar_clave = TRUE WHERE id = v_id;

    RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.alta_clase_prueba(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.alta_clase_prueba(TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 4. Verificación
-- ---------------------------------------------------------------------
SELECT id, nombre, precio, dias_por_semana FROM public.planes;

SELECT nombre, apellido, plan, estado_alumno, estado_membresia
  FROM public.v_membresias ORDER BY apellido;
