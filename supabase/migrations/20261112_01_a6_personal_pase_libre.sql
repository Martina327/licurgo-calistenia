-- =====================================================================
--  A6 · Personal y Pase Libre (CU15, RF12, RNF05) · Pareja A
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261111_03.
--  Es re-ejecutable.
--
--  Decisiones (12/11/2026):
--    · PERSONAL: solo el dueño da de alta recepcionistas y coaches.
--      Entran con su EMAIL real y una clave provisoria que genera el
--      sistema; en el primer ingreso la cambian (debe_cambiar_clave).
--      Los alumnos siguen entrando con DNI. El DNI del personal es
--      opcional (así un profe puede tener además su cuenta de alumno).
--    · PASE LIBRE: lo pueden asignar el dueño y la recepcionista (con
--      motivo: el profe, la persona que elija el profe, etc.). No vence:
--      lo QUITA solo el dueño. Queda registrado quién y cuándo.
--      Un alumno con pase libre cuenta como Activo y al día: no aparece
--      en alertas de cuota ni en invitaciones a retomar.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Personal: DNI opcional para el staff
-- ---------------------------------------------------------------------
ALTER TABLE public.usuarios ALTER COLUMN dni DROP NOT NULL;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS chk_dni_alumno;
ALTER TABLE public.usuarios ADD  CONSTRAINT chk_dni_alumno CHECK (rol <> 'Alumno' OR dni IS NOT NULL);


-- Clave provisoria legible (sin 0/O, 1/l/I)
CREATE OR REPLACE FUNCTION public._generar_clave() RETURNS TEXT
LANGUAGE plpgsql VOLATILE SET search_path = public, extensions AS $$
DECLARE
    v_abc   TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';
    v_bytes BYTEA := extensions.gen_random_bytes(10);
    v_clave TEXT := '';
BEGIN
    FOR i IN 0..9 LOOP
        v_clave := v_clave || substr(v_abc, (get_byte(v_bytes, i) % length(v_abc)) + 1, 1);
    END LOOP;
    RETURN v_clave;
END $$;
REVOKE EXECUTE ON FUNCTION public._generar_clave() FROM PUBLIC, anon, authenticated;


-- Valida que el id sea de personal editable (Recepcionista o Coach)
CREATE OR REPLACE FUNCTION public._personal_editable(p_id UUID) RETURNS public.usuarios
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u public.usuarios;
BEGIN
    SELECT * INTO v_u FROM public.usuarios WHERE id = p_id AND rol IN ('Recepcionista', 'Coach');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERSONAL_INEXISTENTE';
    END IF;
    RETURN v_u;
END $$;
REVOKE EXECUTE ON FUNCTION public._personal_editable(UUID) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Alta de personal (solo SuperAdmin). Devuelve el id y la clave provisoria.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.alta_personal(TEXT, TEXT, TEXT, TEXT, public.rol_usuario);

CREATE FUNCTION public.alta_personal(
    p_email    TEXT,
    p_nombre   TEXT,
    p_apellido TEXT,
    p_telefono TEXT,
    p_rol      public.rol_usuario
)
RETURNS TABLE (usuario_id UUID, clave TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE
    v_email    TEXT := public._normalizar_email(p_email);
    v_nombre   TEXT := trim(coalesce(p_nombre, ''));
    v_apellido TEXT := trim(coalesce(p_apellido, ''));
    v_telefono TEXT := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');
    v_clave    TEXT := public._generar_clave();
    v_id       UUID := gen_random_uuid();
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    IF p_rol NOT IN ('Recepcionista', 'Coach') THEN
        RAISE EXCEPTION 'ROL_INVALIDO: %', p_rol;
    END IF;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'EMAIL_REQUERIDO';
    END IF;
    IF v_nombre = '' OR v_apellido = '' THEN
        RAISE EXCEPTION 'DATOS_REQUERIDOS: nombre y apellido';
    END IF;
    IF v_telefono IS NOT NULL AND length(v_telefono) < 10 THEN
        RAISE EXCEPTION 'CELULAR_INVALIDO: %', p_telefono;
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
        RAISE EXCEPTION 'EMAIL_EXISTENTE: %', v_email;
    END IF;

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, email_change,
                            email_change_token_new, recovery_token, email_change_token_current,
                            phone_change, phone_change_token, reauthentication_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
            v_email, extensions.crypt(v_clave, extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                               'rol', p_rol),
            jsonb_build_object('nombre', v_nombre, 'apellido', v_apellido,
                               'telefono', v_telefono, 'email_contacto', v_email),
            now(), now(), '', '', '', '', '', '', '', '');

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
            'email', NULL, now(), now());

    UPDATE public.usuarios SET debe_cambiar_clave = TRUE WHERE id = v_id;

    RETURN QUERY SELECT v_id, v_clave;
END $$;

REVOKE EXECUTE ON FUNCTION public.alta_personal(TEXT, TEXT, TEXT, TEXT, public.rol_usuario) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.alta_personal(TEXT, TEXT, TEXT, TEXT, public.rol_usuario) TO authenticated;


-- ---------------------------------------------------------------------
-- 3. Editar personal (solo SuperAdmin). Si cambia el email, cambia el login.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.editar_personal(UUID, TEXT, TEXT, TEXT, TEXT, public.rol_usuario);

CREATE FUNCTION public.editar_personal(
    p_id       UUID,
    p_email    TEXT,
    p_nombre   TEXT,
    p_apellido TEXT,
    p_telefono TEXT,
    p_rol      public.rol_usuario
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
    v_u        public.usuarios;
    v_email    TEXT := public._normalizar_email(p_email);
    v_nombre   TEXT := trim(coalesce(p_nombre, ''));
    v_apellido TEXT := trim(coalesce(p_apellido, ''));
    v_telefono TEXT := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');
    v_login    TEXT;
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    v_u := public._personal_editable(p_id);
    IF p_rol NOT IN ('Recepcionista', 'Coach') THEN
        RAISE EXCEPTION 'ROL_INVALIDO: %', p_rol;
    END IF;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'EMAIL_REQUERIDO';
    END IF;
    IF v_nombre = '' OR v_apellido = '' THEN
        RAISE EXCEPTION 'DATOS_REQUERIDOS: nombre y apellido';
    END IF;
    IF v_telefono IS NOT NULL AND length(v_telefono) < 10 THEN
        RAISE EXCEPTION 'CELULAR_INVALIDO: %', p_telefono;
    END IF;
    -- Una recepcionista con la caja abierta no puede pasar a coach
    IF v_u.rol = 'Recepcionista' AND p_rol <> 'Recepcionista'
       AND EXISTS (SELECT 1 FROM public.turnos_caja WHERE usuario_id = p_id AND cerrado_at IS NULL) THEN
        RAISE EXCEPTION 'TURNO_ABIERTO';
    END IF;

    SELECT email INTO v_login FROM auth.users WHERE id = p_id;
    IF lower(v_login) <> v_email THEN
        IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email AND id <> p_id) THEN
            RAISE EXCEPTION 'EMAIL_EXISTENTE: %', v_email;
        END IF;
        UPDATE auth.users SET email = v_email, updated_at = now() WHERE id = p_id;
        UPDATE auth.identities
           SET identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
         WHERE user_id = p_id AND provider = 'email';
    END IF;

    UPDATE public.usuarios
       SET nombre = v_nombre, apellido = v_apellido, telefono = v_telefono,
           email_contacto = v_email, rol = p_rol
     WHERE id = p_id;
    UPDATE auth.users
       SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('rol', p_rol)
     WHERE id = p_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.editar_personal(UUID, TEXT, TEXT, TEXT, TEXT, public.rol_usuario) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.editar_personal(UUID, TEXT, TEXT, TEXT, TEXT, public.rol_usuario) TO authenticated;


-- ---------------------------------------------------------------------
-- 4. Baja / reactivación y nueva clave provisoria (solo SuperAdmin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_personal(p_id UUID, p_activo BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    PERFORM public._personal_editable(p_id);
    IF NOT p_activo AND EXISTS (SELECT 1 FROM public.turnos_caja WHERE usuario_id = p_id AND cerrado_at IS NULL) THEN
        RAISE EXCEPTION 'TURNO_ABIERTO';
    END IF;
    UPDATE public.usuarios SET activo = p_activo WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.restablecer_clave_personal(p_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE v_clave TEXT := public._generar_clave();
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    PERFORM public._personal_editable(p_id);
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_clave, extensions.gen_salt('bf')), updated_at = now()
     WHERE id = p_id;
    UPDATE public.usuarios SET debe_cambiar_clave = TRUE WHERE id = p_id;
    RETURN v_clave;
END $$;

REVOKE EXECUTE ON FUNCTION public.cambiar_estado_personal(UUID, BOOLEAN), public.restablecer_clave_personal(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cambiar_estado_personal(UUID, BOOLEAN), public.restablecer_clave_personal(UUID) TO authenticated;


-- Listado de personal con su email de ingreso (solo SuperAdmin)
CREATE OR REPLACE VIEW public.v_personal WITH (security_invoker = true) AS
SELECT u.id, u.nombre, u.apellido, u.telefono, u.rol, u.activo, u.debe_cambiar_clave,
       u.email_contacto AS email, u.created_at
  FROM public.usuarios u
 WHERE u.rol IN ('SuperAdmin', 'Recepcionista', 'Coach')
   AND public.mi_rol() = 'SuperAdmin';
GRANT SELECT ON public.v_personal TO authenticated;


-- ---------------------------------------------------------------------
-- 5. Pase Libre
-- ---------------------------------------------------------------------
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS pase_libre        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS pase_libre_motivo TEXT;
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS pase_libre_por    UUID REFERENCES public.usuarios(id);
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS pase_libre_at     TIMESTAMPTZ;
-- (sin GRANT UPDATE: solo se cambian con las funciones de abajo)

-- Historial: quién lo dio o lo quitó, cuándo y por qué
CREATE TABLE IF NOT EXISTS public.pase_libre_historial (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id   UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    activo      BOOLEAN NOT NULL,
    motivo      TEXT,
    usuario_id  UUID NOT NULL REFERENCES public.usuarios(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pase_libre_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pase_libre_historial_select ON public.pase_libre_historial;
CREATE POLICY pase_libre_historial_select ON public.pase_libre_historial FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));
REVOKE INSERT, UPDATE, DELETE ON public.pase_libre_historial FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.asignar_pase_libre(p_alumno_id UUID, p_motivo TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_motivo TEXT := trim(coalesce(p_motivo, ''));
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    PERFORM public._alumno_existente(p_alumno_id);
    IF v_motivo = '' THEN
        RAISE EXCEPTION 'MOTIVO_PASE_REQUERIDO';
    END IF;
    UPDATE public.alumnos
       SET pase_libre = TRUE, pase_libre_motivo = v_motivo,
           pase_libre_por = auth.uid(), pase_libre_at = now()
     WHERE usuario_id = p_alumno_id;
    INSERT INTO public.pase_libre_historial (alumno_id, activo, motivo, usuario_id)
    VALUES (p_alumno_id, TRUE, v_motivo, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.quitar_pase_libre(p_alumno_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    PERFORM public._alumno_existente(p_alumno_id);
    UPDATE public.alumnos
       SET pase_libre = FALSE, pase_libre_motivo = NULL, pase_libre_por = auth.uid(), pase_libre_at = now()
     WHERE usuario_id = p_alumno_id AND pase_libre;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SIN_PASE_LIBRE';
    END IF;
    INSERT INTO public.pase_libre_historial (alumno_id, activo, motivo, usuario_id)
    VALUES (p_alumno_id, FALSE, NULL, auth.uid());
END $$;

REVOKE EXECUTE ON FUNCTION public.asignar_pase_libre(UUID, TEXT), public.quitar_pase_libre(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.asignar_pase_libre(UUID, TEXT), public.quitar_pase_libre(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 6. v_membresias: pase_libre y pase_libre_motivo AL FINAL
--    (B6 ya lee pase_libre). Con pase libre el alumno es Activo.
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
        WHEN a.pase_libre                                    THEN 'Activo'
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
    ], NULL)                                   AS datos_faltantes,
    a.pase_libre,
    a.pase_libre_motivo
FROM public.usuarios u
JOIN public.alumnos a        ON a.usuario_id = u.id
LEFT JOIN public.planes p    ON p.id = a.plan_id
LEFT JOIN LATERAL (
    SELECT ca.fecha_vencimiento FROM public.certificados_aptos ca
     WHERE ca.alumno_id = u.id ORDER BY ca.fecha_vencimiento DESC LIMIT 1
) c ON TRUE
WHERE u.activo;


-- Alertas de cuota: sin los que tienen pase libre (el certificado sí se sigue pidiendo)
CREATE OR REPLACE VIEW public.v_alertas WITH (security_invoker = true) AS
SELECT alumno_id, dni, nombre, apellido, telefono, 'Membresía'::text AS tipo,
       estado_membresia AS estado, fecha_vencimiento AS vence, dias_restantes
  FROM public.v_membresias
 WHERE estado_alumno = 'Activo'
   AND NOT pase_libre
   AND estado_membresia IN ('Por vencer', 'Vencida')
UNION ALL
SELECT alumno_id, dni, nombre, apellido, telefono, 'Certificado',
       estado_certificado, certificado_vencimiento,
       certificado_vencimiento - public.hoy_ar()
  FROM public.v_membresias
 WHERE estado_alumno <> 'Inactivo'
   AND estado_certificado IN ('Por vencer', 'Vencido', 'Sin certificado');


-- ---------------------------------------------------------------------
-- 7. Verificación
-- ---------------------------------------------------------------------
SELECT nombre, apellido, rol, email FROM public.usuarios u
  LEFT JOIN LATERAL (SELECT email FROM auth.users a WHERE a.id = u.id) a ON TRUE
 WHERE rol <> 'Alumno' ORDER BY rol;
