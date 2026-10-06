-- =====================================================================
--  LICURGO CALISTENIA · ESQUEMA COMPLETO v2
--  Sistema Integral de Gestión Administrativa y Progresión Deportiva
--  Script para el SQL Editor de Supabase (PostgreSQL 15+)
--
--  Módulos: Usuarios/Auth · Membresías · Comprobantes · Certificados
--           Caja/Turnos · Kiosco/Stock · Subalquileres · Ingresos
--           Asistencias · Ejercicios/Rutinas · Observaciones (CU10)
--           Alertas de vencimiento · Dashboard · Concurrencia
--
--  ⚠️  La sección 0 BORRA todo el esquema anterior (incluido el del
--      script modulo_coach.sql) y los usuarios mock de Auth.
--      Solo para desarrollo. No correr con datos reales cargados.
--
--  LOGIN CON DNI: el front convierte el DNI en un email interno
--      `${dni}@licurgo.test` y llama a supabase.auth.signInWithPassword.
--      Usuarios mock: contraseña  Licurgo2026!
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. LIMPIEZA (re-ejecutable)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_nuevo_usuario_auth ON auth.users;

DROP VIEW IF EXISTS public.v_rutina_activa, public.v_membresias, public.v_alertas,
                    public.v_ingresos_diarios, public.v_concurrencia,
                    public.v_rutina_alumno CASCADE;

DROP TABLE IF EXISTS
    -- esquema v1 (modulo_coach.sql)
    public.fichas_observaciones, public.item_ejercicio, public.rutina_dia,
    -- esquema v2
    public.observaciones_alumno, public.rutina_items, public.rutina_dias, public.rutinas,
    public.ejercicios, public.asistencias, public.ingresos, public.venta_items,
    public.ventas, public.productos, public.espacios_alquiler, public.turnos_caja,
    public.comprobantes_pago, public.certificados_aptos, public.alumnos,
    public.planes, public.usuarios
CASCADE;

DROP TYPE IF EXISTS public.rol_usuario, public.bloque_ejercicio, public.tipo_observacion,
                    public.categoria_ejercicio, public.medio_pago, public.estado_comprobante,
                    public.concepto_ingreso CASCADE;

DROP FUNCTION IF EXISTS public.fn_set_fecha_actualizacion, public.fn_validar_roles_rutina,
    public.fn_validar_roles_ficha, public.hoy_ar, public.mi_rol, public.es_staff,
    public._exigir_rol, public._turno_abierto, public._extender_membresia,
    public.fn_nuevo_usuario_auth, public.fn_validar_roles_coach_alumno,
    public.fn_tocar_rutina, public.registrar_checkin, public.aprobar_comprobante,
    public.rechazar_comprobante, public.registrar_pago_efectivo, public.registrar_venta,
    public.registrar_cobro_alquiler, public.abrir_turno, public.cerrar_turno,
    public.justificar_cierre, public._crear_usuario_mock CASCADE;

-- Usuarios mock de Supabase Auth (por DNI)
DELETE FROM auth.users
 WHERE email IN ('20111111@licurgo.test', '25222222@licurgo.test', '30111222@licurgo.test',
                 '40111001@licurgo.test', '41222002@licurgo.test', '39333003@licurgo.test');


-- ---------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- ---------------------------------------------------------------------
CREATE TYPE public.rol_usuario         AS ENUM ('SuperAdmin', 'Recepcionista', 'Coach', 'Alumno');
CREATE TYPE public.bloque_ejercicio    AS ENUM ('Entrada en calor', 'Fuerza', 'Accesorios');
CREATE TYPE public.categoria_ejercicio AS ENUM ('Tracción', 'Empuje', 'Core', 'Piernas', 'Movilidad', 'Skill');
CREATE TYPE public.tipo_observacion    AS ENUM ('Lesión', 'Movilidad', 'Progresión técnica', 'General');
CREATE TYPE public.medio_pago          AS ENUM ('Efectivo', 'Transferencia');
CREATE TYPE public.estado_comprobante  AS ENUM ('Pendiente', 'Aprobado', 'Rechazado');
CREATE TYPE public.concepto_ingreso    AS ENUM ('Cuota', 'Kiosco', 'Subalquiler');


-- ---------------------------------------------------------------------
-- 2. UTILIDADES
-- ---------------------------------------------------------------------

-- Fecha "de hoy" en Argentina (el servidor de Supabase corre en UTC)
CREATE FUNCTION public.hoy_ar() RETURNS date
LANGUAGE sql STABLE AS $$
    SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
$$;


-- ---------------------------------------------------------------------
-- 3. USUARIOS Y ALUMNOS  (CU01, CU02, CU15)
--    usuarios.id = auth.users.id  → un perfil por cuenta de Auth.
--    La baja es LÓGICA (activo = false): nunca se borran usuarios con
--    movimientos de dinero asociados.
-- ---------------------------------------------------------------------
CREATE TABLE public.usuarios (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    dni             TEXT NOT NULL UNIQUE CHECK (dni ~ '^[0-9]{7,8}$'),
    nombre          TEXT NOT NULL,
    apellido        TEXT NOT NULL,
    telefono        TEXT,                          -- WhatsApp de contacto
    email_contacto  TEXT,                          -- email real (opcional)
    rol             public.rol_usuario NOT NULL DEFAULT 'Alumno',
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usuarios_rol ON public.usuarios (rol) WHERE activo;

-- Rol del usuario autenticado (usado por todas las políticas RLS)
CREATE FUNCTION public.mi_rol() RETURNS public.rol_usuario
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT rol FROM public.usuarios WHERE id = auth.uid() AND activo
$$;

CREATE FUNCTION public.es_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(public.mi_rol() IN ('SuperAdmin', 'Recepcionista', 'Coach'), false)
$$;

-- Corta la ejecución si el usuario no tiene uno de los roles indicados
CREATE FUNCTION public._exigir_rol(p_roles public.rol_usuario[]) RETURNS public.rol_usuario
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol public.rol_usuario := public.mi_rol();
BEGIN
    IF v_rol IS NULL OR NOT (v_rol = ANY (p_roles)) THEN
        RAISE EXCEPTION 'PERMISO_DENEGADO: se requiere rol %', p_roles USING ERRCODE = '42501';
    END IF;
    RETURN v_rol;
END $$;

CREATE TABLE public.planes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre           TEXT NOT NULL UNIQUE,
    precio           NUMERIC(12,2) NOT NULL CHECK (precio > 0),
    dias_por_semana  SMALLINT CHECK (dias_por_semana BETWEEN 1 AND 7),   -- NULL = libre
    activo           BOOLEAN NOT NULL DEFAULT TRUE
);

-- Subtipo 1:1 de usuarios para el rol Alumno
CREATE TABLE public.alumnos (
    usuario_id           UUID PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
    plan_id              UUID REFERENCES public.planes(id),
    fecha_nacimiento     DATE,
    contacto_emergencia  TEXT,
    fecha_vencimiento    DATE,          -- NULL = nunca pagó. Solo la modifican las funciones de cobro.
    fecha_alta           DATE NOT NULL DEFAULT public.hoy_ar()
);
CREATE INDEX idx_alumnos_vencimiento ON public.alumnos (fecha_vencimiento);

-- Alta automática del perfil cuando se crea la cuenta en Supabase Auth.
--   · rol      → raw_app_meta_data.rol   (solo lo puede fijar el service role:
--                 un alumno NO puede auto-asignarse SuperAdmin)
--   · datos    → raw_user_meta_data.{dni, nombre, apellido, telefono, plan_id}
CREATE FUNCTION public.fn_nuevo_usuario_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rol public.rol_usuario := coalesce((NEW.raw_app_meta_data->>'rol')::public.rol_usuario, 'Alumno');
BEGIN
    INSERT INTO public.usuarios (id, dni, nombre, apellido, telefono, email_contacto, rol)
    VALUES (NEW.id,
            NEW.raw_user_meta_data->>'dni',
            coalesce(NEW.raw_user_meta_data->>'nombre', ''),
            coalesce(NEW.raw_user_meta_data->>'apellido', ''),
            NEW.raw_user_meta_data->>'telefono',
            NEW.raw_user_meta_data->>'email_contacto',
            v_rol);

    IF v_rol = 'Alumno' THEN
        INSERT INTO public.alumnos (usuario_id, plan_id)
        VALUES (NEW.id, nullif(NEW.raw_user_meta_data->>'plan_id', '')::uuid);
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_nuevo_usuario_auth
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.fn_nuevo_usuario_auth();


-- ---------------------------------------------------------------------
-- 4. CERTIFICADOS DE APTITUD FÍSICA  (RF11 nuevo)
--    Archivo en el bucket privado `certificados`, carpeta = id del alumno.
--    Un certificado vencido genera alerta; NO bloquea el check-in.
-- ---------------------------------------------------------------------
CREATE TABLE public.certificados_aptos (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id          UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    archivo_path       TEXT NOT NULL,                 -- ej: '<alumno_id>/apto-2026.pdf'
    fecha_emision      DATE NOT NULL,
    fecha_vencimiento  DATE NOT NULL,
    cargado_por        UUID NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_vencimiento > fecha_emision)
);
CREATE INDEX idx_certificados_alumno ON public.certificados_aptos (alumno_id, fecha_vencimiento DESC);


-- ---------------------------------------------------------------------
-- 5. COMPROBANTES DE TRANSFERENCIA  (CU07, CU08)
-- ---------------------------------------------------------------------
CREATE TABLE public.comprobantes_pago (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id        UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE RESTRICT,
    archivo_path     TEXT NOT NULL,                  -- bucket `comprobantes`: '<alumno_id>/<archivo>'
    monto_declarado  NUMERIC(12,2) CHECK (monto_declarado > 0),
    estado           public.estado_comprobante NOT NULL DEFAULT 'Pendiente',
    motivo_rechazo   TEXT,
    revisado_por     UUID REFERENCES public.usuarios(id),
    revisado_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (estado <> 'Rechazado' OR motivo_rechazo IS NOT NULL)
);
CREATE INDEX idx_comprobantes_pendientes ON public.comprobantes_pago (created_at) WHERE estado = 'Pendiente';


-- ---------------------------------------------------------------------
-- 6. CAJA POR TURNO  (CU05 · arqueo ciego)
--    · El recepcionista abre turno declarando el fondo inicial.
--    · Durante el turno NO ve cuánto efectivo "debería" haber.
--    · Al cerrar, ingresa lo que contó; recién ahí el sistema calcula
--      el esperado y revela la diferencia.
-- ---------------------------------------------------------------------
CREATE TABLE public.turnos_caja (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id),
    abierto_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    monto_inicial   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_inicial >= 0),
    cerrado_at      TIMESTAMPTZ,
    monto_contado   NUMERIC(12,2) CHECK (monto_contado >= 0),
    monto_esperado  NUMERIC(12,2),
    diferencia      NUMERIC(12,2) GENERATED ALWAYS AS (monto_contado - monto_esperado) STORED,
    comentario      TEXT,
    CHECK ((cerrado_at IS NULL) = (monto_contado IS NULL))
);
-- Un solo turno abierto por persona
CREATE UNIQUE INDEX uq_turno_abierto ON public.turnos_caja (usuario_id) WHERE cerrado_at IS NULL;


-- ---------------------------------------------------------------------
-- 7. KIOSCO Y STOCK  (CU04, CU14)
-- ---------------------------------------------------------------------
CREATE TABLE public.productos (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre  TEXT NOT NULL UNIQUE,
    precio  NUMERIC(12,2) NOT NULL CHECK (precio > 0),
    stock   INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE public.ventas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendedor_id  UUID NOT NULL REFERENCES public.usuarios(id),
    medio_pago   public.medio_pago NOT NULL,
    turno_id     UUID REFERENCES public.turnos_caja(id),
    total        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.venta_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id         UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
    producto_id      UUID NOT NULL REFERENCES public.productos(id),
    cantidad         INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario  NUMERIC(12,2) NOT NULL,       -- precio congelado al momento de la venta
    subtotal         NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);


-- ---------------------------------------------------------------------
-- 8. SUBALQUILERES  (CU16)
-- ---------------------------------------------------------------------
CREATE TABLE public.espacios_alquiler (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          TEXT NOT NULL,                  -- ej: 'Sector funcional – sábados'
    locatario       TEXT NOT NULL,                  -- quién alquila
    canon_sugerido  NUMERIC(12,2) CHECK (canon_sugerido > 0),
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);


-- ---------------------------------------------------------------------
-- 9. INGRESOS  (libro único de entradas de dinero → Dashboard CU12)
--    Cada cobro (cuota, kiosco, subalquiler) genera UNA fila acá.
--    · Efectivo      → lleva turno_id (suma a la caja física del turno)
--    · Transferencia → turno_id NULL (no entra a caja, sí al dashboard)
--    Solo el SuperAdmin puede leer esta tabla.
-- ---------------------------------------------------------------------
CREATE TABLE public.ingresos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concepto        public.concepto_ingreso NOT NULL,
    medio_pago      public.medio_pago NOT NULL,
    monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    alumno_id       UUID REFERENCES public.alumnos(usuario_id) ON DELETE RESTRICT,
    comprobante_id  UUID UNIQUE REFERENCES public.comprobantes_pago(id),
    venta_id        UUID UNIQUE REFERENCES public.ventas(id),
    espacio_id      UUID REFERENCES public.espacios_alquiler(id),
    turno_id        UUID REFERENCES public.turnos_caja(id),
    detalle         TEXT,
    registrado_por  UUID NOT NULL REFERENCES public.usuarios(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_origen CHECK (
        (concepto = 'Cuota'       AND alumno_id  IS NOT NULL AND venta_id IS NULL AND espacio_id IS NULL) OR
        (concepto = 'Kiosco'      AND venta_id   IS NOT NULL AND alumno_id IS NULL AND espacio_id IS NULL) OR
        (concepto = 'Subalquiler' AND espacio_id IS NOT NULL AND alumno_id IS NULL AND venta_id IS NULL)
    ),
    CONSTRAINT chk_caja CHECK ((medio_pago = 'Efectivo') = (turno_id IS NOT NULL))
);
CREATE INDEX idx_ingresos_fecha ON public.ingresos (created_at);
CREATE INDEX idx_ingresos_turno ON public.ingresos (turno_id) WHERE turno_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- 10. ASISTENCIAS  (CU03, CU13)
-- ---------------------------------------------------------------------
CREATE TABLE public.asistencias (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id       UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    registrado_por  UUID NOT NULL REFERENCES public.usuarios(id),
    fecha_hora      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha           DATE NOT NULL DEFAULT public.hoy_ar(),
    CONSTRAINT uq_asistencia_diaria UNIQUE (alumno_id, fecha)
);


-- ---------------------------------------------------------------------
-- 11. EJERCICIOS Y RUTINAS  (CU09, CU11)
--     rutinas (1 activa por alumno) → rutina_dias (Día 1, Día 2…)
--     → rutina_items (ejercicio del catálogo + bloque + series/reps)
--     El checklist del alumno vive en el front (localStorage, RNF04).
-- ---------------------------------------------------------------------
CREATE TABLE public.ejercicios (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre           TEXT NOT NULL UNIQUE,
    categoria        public.categoria_ejercicio NOT NULL,
    descripcion      TEXT,
    video_url        TEXT,
    prerrequisito_id UUID REFERENCES public.ejercicios(id) ON DELETE SET NULL,  -- progresión anterior
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (prerrequisito_id IS DISTINCT FROM id)
);

CREATE TABLE public.rutinas (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id            UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    coach_id             UUID NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id),
    nombre               TEXT NOT NULL,
    objetivo             TEXT,
    activa               BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_rutina_activa_por_alumno ON public.rutinas (alumno_id) WHERE activa;

CREATE TABLE public.rutina_dias (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rutina_id   UUID NOT NULL REFERENCES public.rutinas(id) ON DELETE CASCADE,
    numero_dia  SMALLINT NOT NULL CHECK (numero_dia BETWEEN 1 AND 7),
    nombre      TEXT,                                -- ej: 'Tracción + Core'
    CONSTRAINT uq_dia_por_rutina UNIQUE (rutina_id, numero_dia)
);

CREATE TABLE public.rutina_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rutina_dia_id  UUID NOT NULL REFERENCES public.rutina_dias(id) ON DELETE CASCADE,
    ejercicio_id   UUID NOT NULL REFERENCES public.ejercicios(id),
    bloque         public.bloque_ejercicio NOT NULL,
    orden          SMALLINT NOT NULL CHECK (orden > 0),
    series         SMALLINT NOT NULL CHECK (series > 0),
    repeticiones   TEXT NOT NULL,                    -- '8', '30s', '5 c/lado', 'máx'
    descanso_seg   SMALLINT CHECK (descanso_seg >= 0),
    nota           TEXT,                             -- indicación visible para el alumno
    CONSTRAINT uq_orden_por_dia UNIQUE (rutina_dia_id, orden)
);


-- ---------------------------------------------------------------------
-- 12. OBSERVACIONES DEL ALUMNO  (CU10)
--     Privadas: SOLO Coach y SuperAdmin. El alumno no las ve.
-- ---------------------------------------------------------------------
CREATE TABLE public.observaciones_alumno (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id    UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    coach_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id),
    tipo         public.tipo_observacion NOT NULL DEFAULT 'General',
    titulo       TEXT NOT NULL,
    descripcion  TEXT NOT NULL,
    vigente      BOOLEAN NOT NULL DEFAULT TRUE,     -- lesión activa / ya resuelta
    fecha        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_observaciones_alumno ON public.observaciones_alumno (alumno_id, fecha DESC);


-- ---------------------------------------------------------------------
-- 13. TRIGGERS DE INTEGRIDAD
-- ---------------------------------------------------------------------

-- coach_id debe ser Coach/SuperAdmin (rutinas y observaciones)
CREATE FUNCTION public.fn_validar_roles_coach_alumno() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.usuarios
                    WHERE id = NEW.coach_id AND rol IN ('Coach', 'SuperAdmin') AND activo) THEN
        RAISE EXCEPTION 'El autor % no es Coach ni SuperAdmin activo', NEW.coach_id;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_rutinas_roles BEFORE INSERT OR UPDATE OF coach_id ON public.rutinas
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_roles_coach_alumno();
CREATE TRIGGER trg_observaciones_roles BEFORE INSERT OR UPDATE OF coach_id ON public.observaciones_alumno
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_roles_coach_alumno();

-- Cualquier cambio en la rutina, sus días o sus ítems actualiza fecha_actualizacion
CREATE FUNCTION public.fn_tocar_rutina() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rutina UUID;
BEGIN
    IF TG_TABLE_NAME = 'rutinas' THEN
        NEW.fecha_actualizacion := now();
        RETURN NEW;
    ELSIF TG_TABLE_NAME = 'rutina_dias' THEN
        v_rutina := coalesce(NEW.rutina_id, OLD.rutina_id);
    ELSE
        SELECT rutina_id INTO v_rutina FROM public.rutina_dias
         WHERE id = coalesce(NEW.rutina_dia_id, OLD.rutina_dia_id);
    END IF;
    UPDATE public.rutinas SET fecha_actualizacion = now() WHERE id = v_rutina;
    RETURN coalesce(NEW, OLD);
END $$;

CREATE TRIGGER trg_rutinas_fecha BEFORE UPDATE ON public.rutinas
    FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_rutina();
CREATE TRIGGER trg_dias_tocan_rutina AFTER INSERT OR UPDATE OR DELETE ON public.rutina_dias
    FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_rutina();
CREATE TRIGGER trg_items_tocan_rutina AFTER INSERT OR UPDATE OR DELETE ON public.rutina_items
    FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_rutina();


-- ---------------------------------------------------------------------
-- 14. FUNCIONES DE NEGOCIO (RPC)
--     Toda operación que mueve dinero o membresías pasa por acá:
--     son atómicas y validan el rol en el servidor.
--     Desde React:  supabase.rpc('nombre_funcion', { p_param: valor })
-- ---------------------------------------------------------------------

-- Regla de membresía: SIEMPRE se suman 30 días al vencimiento actual,
-- sin importar si paga antes o después.
--   vence el 01/11, paga el 27/10 (5 días antes)  → nuevo vto. 01/12 (35 días)
--   vence el 01/11, paga el 11/11 (10 días tarde) → nuevo vto. 01/12 (20 días)
--   alumno nuevo (sin vencimiento)               → hoy + 30
CREATE FUNCTION public._extender_membresia(p_alumno_id UUID) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nuevo date;
BEGIN
    UPDATE public.alumnos
       SET fecha_vencimiento = coalesce(fecha_vencimiento, public.hoy_ar()) + 30
     WHERE usuario_id = p_alumno_id
    RETURNING fecha_vencimiento INTO v_nuevo;
    IF v_nuevo IS NULL THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', p_alumno_id;
    END IF;
    RETURN v_nuevo;
END $$;

-- Turno abierto del usuario actual (obligatorio para cobrar en efectivo)
CREATE FUNCTION public._turno_abierto() RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.turnos_caja
     WHERE usuario_id = auth.uid() AND cerrado_at IS NULL;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'SIN_TURNO_ABIERTO: abrí un turno de caja para cobrar en efectivo';
    END IF;
    RETURN v_id;
END $$;


-- 14.1 Check-in (CU03). El alumno marca su propio presente; recepción puede marcar a cualquiera.
CREATE FUNCTION public.registrar_checkin(p_alumno_id UUID DEFAULT NULL)
RETURNS public.asistencias
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rol    public.rol_usuario := public._exigir_rol('{Alumno,Recepcionista,SuperAdmin}');
    v_alumno UUID := coalesce(p_alumno_id, auth.uid());
    v_venc   date;
    v_row    public.asistencias;
BEGIN
    IF v_rol = 'Alumno' AND v_alumno <> auth.uid() THEN
        RAISE EXCEPTION 'PERMISO_DENEGADO: un alumno solo puede marcar su propio presente';
    END IF;

    SELECT a.fecha_vencimiento INTO v_venc
      FROM public.alumnos a JOIN public.usuarios u ON u.id = a.usuario_id
     WHERE a.usuario_id = v_alumno AND u.activo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', v_alumno;
    END IF;
    IF v_venc IS NULL OR v_venc < public.hoy_ar() THEN
        RAISE EXCEPTION 'MEMBRESIA_VENCIDA: acercate a recepción o subí tu comprobante';
    END IF;

    INSERT INTO public.asistencias (alumno_id, registrado_por)
    VALUES (v_alumno, auth.uid())
    ON CONFLICT (alumno_id, fecha) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN   -- ya había marcado hoy: devolvemos el registro existente
        SELECT * INTO v_row FROM public.asistencias
         WHERE alumno_id = v_alumno AND fecha = public.hoy_ar();
    END IF;
    RETURN v_row;
END $$;


-- 14.2 Aprobar comprobante (CU08). Devuelve el nuevo vencimiento.
--      p_monto: lo que efectivamente se acreditó (por defecto, el precio del plan).
CREATE FUNCTION public.aprobar_comprobante(p_comprobante_id UUID, p_monto NUMERIC DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_comp  public.comprobantes_pago;
    v_monto NUMERIC;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');

    SELECT * INTO v_comp FROM public.comprobantes_pago WHERE id = p_comprobante_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'COMPROBANTE_INEXISTENTE'; END IF;
    IF v_comp.estado <> 'Pendiente' THEN
        RAISE EXCEPTION 'COMPROBANTE_YA_REVISADO: estado %', v_comp.estado;
    END IF;

    SELECT coalesce(p_monto, p.precio) INTO v_monto
      FROM public.alumnos a LEFT JOIN public.planes p ON p.id = a.plan_id
     WHERE a.usuario_id = v_comp.alumno_id;
    IF v_monto IS NULL THEN
        RAISE EXCEPTION 'SIN_MONTO: el alumno no tiene plan; indicá el monto acreditado';
    END IF;

    UPDATE public.comprobantes_pago
       SET estado = 'Aprobado', revisado_por = auth.uid(), revisado_at = now()
     WHERE id = p_comprobante_id;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, comprobante_id, registrado_por, detalle)
    VALUES ('Cuota', 'Transferencia', v_monto, v_comp.alumno_id, v_comp.id, auth.uid(), 'Cuota - Transferencia');

    RETURN public._extender_membresia(v_comp.alumno_id);
END $$;


-- 14.3 Rechazar comprobante (CU08 alternativo)
CREATE FUNCTION public.rechazar_comprobante(p_comprobante_id UUID, p_motivo TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    IF coalesce(trim(p_motivo), '') = '' THEN
        RAISE EXCEPTION 'MOTIVO_REQUERIDO';
    END IF;
    UPDATE public.comprobantes_pago
       SET estado = 'Rechazado', motivo_rechazo = trim(p_motivo),
           revisado_por = auth.uid(), revisado_at = now()
     WHERE id = p_comprobante_id AND estado = 'Pendiente';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'COMPROBANTE_INEXISTENTE_O_YA_REVISADO';
    END IF;
END $$;


-- 14.4 Cobro de cuota en efectivo (CU06). Requiere turno abierto. Devuelve el nuevo vencimiento.
CREATE FUNCTION public.registrar_pago_efectivo(p_alumno_id UUID)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_turno  UUID;
    v_precio NUMERIC;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    v_turno := public._turno_abierto();

    SELECT p.precio INTO v_precio
      FROM public.alumnos a JOIN public.planes p ON p.id = a.plan_id
     WHERE a.usuario_id = p_alumno_id;
    IF v_precio IS NULL THEN
        RAISE EXCEPTION 'SIN_PLAN: el alumno no tiene un plan asignado';
    END IF;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, turno_id, registrado_por, detalle)
    VALUES ('Cuota', 'Efectivo', v_precio, p_alumno_id, v_turno, auth.uid(), 'Cuota - Efectivo');

    RETURN public._extender_membresia(p_alumno_id);
END $$;


-- 14.5 Venta de kiosco (CU04). Descuenta stock de forma atómica.
--      p_items: '[{"producto_id": "<uuid>", "cantidad": 2}, ...]'
CREATE FUNCTION public.registrar_venta(p_items JSONB, p_medio public.medio_pago)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_turno UUID;
    v_venta UUID;
    v_total NUMERIC := 0;
    v_prod  public.productos;
    it      RECORD;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'VENTA_VACIA';
    END IF;
    IF p_medio = 'Efectivo' THEN
        v_turno := public._turno_abierto();
    END IF;

    INSERT INTO public.ventas (vendedor_id, medio_pago, turno_id)
    VALUES (auth.uid(), p_medio, v_turno)
    RETURNING id INTO v_venta;

    FOR it IN
        SELECT (e->>'producto_id')::uuid AS producto_id, (e->>'cantidad')::int AS cantidad
          FROM jsonb_array_elements(p_items) e
    LOOP
        IF it.cantidad IS NULL OR it.cantidad <= 0 THEN
            RAISE EXCEPTION 'CANTIDAD_INVALIDA';
        END IF;
        UPDATE public.productos
           SET stock = stock - it.cantidad
         WHERE id = it.producto_id AND activo AND stock >= it.cantidad
        RETURNING * INTO v_prod;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE: producto %', it.producto_id;
        END IF;
        INSERT INTO public.venta_items (venta_id, producto_id, cantidad, precio_unitario)
        VALUES (v_venta, it.producto_id, it.cantidad, v_prod.precio);
        v_total := v_total + v_prod.precio * it.cantidad;
    END LOOP;

    UPDATE public.ventas SET total = v_total WHERE id = v_venta;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, venta_id, turno_id, registrado_por)
    VALUES ('Kiosco', p_medio, v_total, v_venta, v_turno, auth.uid());

    RETURN v_venta;
END $$;


-- 14.6 Cobro de subalquiler (CU16)
CREATE FUNCTION public.registrar_cobro_alquiler(p_espacio_id UUID, p_monto NUMERIC,
                                                p_medio public.medio_pago, p_detalle TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_turno UUID;
    v_id    UUID;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    IF NOT EXISTS (SELECT 1 FROM public.espacios_alquiler WHERE id = p_espacio_id AND activo) THEN
        RAISE EXCEPTION 'ESPACIO_INEXISTENTE';
    END IF;
    IF p_medio = 'Efectivo' THEN
        v_turno := public._turno_abierto();
    END IF;
    INSERT INTO public.ingresos (concepto, medio_pago, monto, espacio_id, turno_id, registrado_por, detalle)
    VALUES ('Subalquiler', p_medio, p_monto, p_espacio_id, v_turno, auth.uid(), p_detalle)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- 14.7 Abrir turno de caja (CU05)
CREATE FUNCTION public.abrir_turno(p_monto_inicial NUMERIC DEFAULT 0)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    IF EXISTS (SELECT 1 FROM public.turnos_caja WHERE usuario_id = auth.uid() AND cerrado_at IS NULL) THEN
        RAISE EXCEPTION 'TURNO_YA_ABIERTO';
    END IF;
    INSERT INTO public.turnos_caja (usuario_id, monto_inicial)
    VALUES (auth.uid(), coalesce(p_monto_inicial, 0))
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;


-- 14.8 Cerrar turno — ARQUEO CIEGO (CU05)
--      El recepcionista manda lo que contó. Recién en la respuesta ve el
--      esperado y la diferencia. El turno queda bloqueado.
CREATE FUNCTION public.cerrar_turno(p_monto_contado NUMERIC, p_comentario TEXT DEFAULT NULL)
RETURNS TABLE (turno_id UUID, monto_inicial NUMERIC, efectivo_cobrado NUMERIC,
               monto_esperado NUMERIC, monto_contado NUMERIC, diferencia NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_turno   public.turnos_caja;
    v_cobrado NUMERIC;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    IF p_monto_contado IS NULL OR p_monto_contado < 0 THEN
        RAISE EXCEPTION 'MONTO_CONTADO_INVALIDO';
    END IF;

    SELECT * INTO v_turno FROM public.turnos_caja t
     WHERE t.usuario_id = auth.uid() AND t.cerrado_at IS NULL
       FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SIN_TURNO_ABIERTO'; END IF;

    SELECT coalesce(sum(i.monto), 0) INTO v_cobrado
      FROM public.ingresos i
     WHERE i.turno_id = v_turno.id AND i.medio_pago = 'Efectivo';

    UPDATE public.turnos_caja t
       SET cerrado_at     = now(),
           monto_contado  = p_monto_contado,
           monto_esperado = v_turno.monto_inicial + v_cobrado,
           comentario     = nullif(trim(p_comentario), '')
     WHERE t.id = v_turno.id;

    RETURN QUERY
    SELECT v_turno.id, v_turno.monto_inicial, v_cobrado,
           v_turno.monto_inicial + v_cobrado, p_monto_contado,
           p_monto_contado - (v_turno.monto_inicial + v_cobrado);
END $$;


-- 14.9 Justificar diferencia (una sola vez, después de ver el resultado del cierre)
CREATE FUNCTION public.justificar_cierre(p_turno_id UUID, p_comentario TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');
    UPDATE public.turnos_caja
       SET comentario = trim(p_comentario)
     WHERE id = p_turno_id
       AND usuario_id = auth.uid()
       AND cerrado_at IS NOT NULL
       AND diferencia <> 0
       AND comentario IS NULL
       AND coalesce(trim(p_comentario), '') <> '';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_SE_PUEDE_JUSTIFICAR: turno inexistente, sin diferencia o ya justificado';
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 15. VISTAS PARA EL FRONT
--     security_invoker = true → la vista respeta el RLS de quien consulta:
--     la misma vista le muestra al alumno solo lo suyo y al staff todo.
-- ---------------------------------------------------------------------

-- Estado de membresía y certificado de cada alumno
CREATE VIEW public.v_membresias WITH (security_invoker = true) AS
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
    END                                        AS estado_certificado
FROM public.usuarios u
JOIN public.alumnos a        ON a.usuario_id = u.id
LEFT JOIN public.planes p    ON p.id = a.plan_id
LEFT JOIN LATERAL (
    SELECT ca.fecha_vencimiento FROM public.certificados_aptos ca
     WHERE ca.alumno_id = u.id ORDER BY ca.fecha_vencimiento DESC LIMIT 1
) c ON TRUE
WHERE u.activo;

-- Alertas in-app: membresías que vencen en ≤ 3 días o ya vencidas,
-- y certificados por vencer/vencidos. El alumno ve solo las suyas;
-- recepción y SuperAdmin ven todas (con teléfono para contactar por WhatsApp).
CREATE VIEW public.v_alertas WITH (security_invoker = true) AS
SELECT alumno_id, dni, nombre, apellido, telefono, 'Membresía'::text AS tipo,
       estado_membresia AS estado, fecha_vencimiento AS vence, dias_restantes
  FROM public.v_membresias
 WHERE estado_membresia IN ('Por vencer', 'Vencida')
UNION ALL
SELECT alumno_id, dni, nombre, apellido, telefono, 'Certificado',
       estado_certificado, certificado_vencimiento,
       certificado_vencimiento - public.hoy_ar()
  FROM public.v_membresias
 WHERE estado_certificado IN ('Por vencer', 'Vencido', 'Sin certificado');

-- Rutina activa completa (para el alumno y para el panel del coach)
CREATE VIEW public.v_rutina_alumno WITH (security_invoker = true) AS
SELECT r.id AS rutina_id, r.alumno_id, r.coach_id, r.nombre AS rutina, r.objetivo,
       r.fecha_actualizacion, d.id AS rutina_dia_id, d.numero_dia, d.nombre AS dia,
       i.id AS item_id, i.bloque, i.orden, e.id AS ejercicio_id, e.nombre AS ejercicio,
       e.categoria, e.video_url, i.series, i.repeticiones, i.descanso_seg, i.nota
  FROM public.rutinas r
  JOIN public.rutina_dias d       ON d.rutina_id = r.id
  LEFT JOIN public.rutina_items i ON i.rutina_dia_id = d.id
  LEFT JOIN public.ejercicios e   ON e.id = i.ejercicio_id
 WHERE r.activa;

-- Dashboard de ingresos (CU12) — solo devuelve filas al SuperAdmin (RLS de ingresos)
CREATE VIEW public.v_ingresos_diarios WITH (security_invoker = true) AS
SELECT (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
       concepto, medio_pago, count(*) AS operaciones, sum(monto) AS total
  FROM public.ingresos
 GROUP BY 1, 2, 3;

-- Concurrencia por día de semana y hora (CU13)
CREATE VIEW public.v_concurrencia WITH (security_invoker = true) AS
SELECT extract(isodow FROM fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS dia_semana,  -- 1 = lunes
       extract(hour   FROM fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS hora,
       count(*) AS checkins,
       count(DISTINCT fecha) AS dias_con_registro
  FROM public.asistencias
 GROUP BY 1, 2;


-- ---------------------------------------------------------------------
-- 16. ROW LEVEL SECURITY (por rol)
-- ---------------------------------------------------------------------
ALTER TABLE public.usuarios             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumnos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificados_aptos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprobantes_pago    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_caja          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.espacios_alquiler    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingresos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ejercicios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutinas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutina_dias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutina_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observaciones_alumno ENABLE ROW LEVEL SECURITY;

-- usuarios: cada uno se ve a sí mismo; el staff ve a todos.
-- Altas: por Auth (trigger). Bajas: lógicas.
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.es_staff());
CREATE POLICY usuarios_update_superadmin ON public.usuarios FOR UPDATE TO authenticated
    USING (public.mi_rol() = 'SuperAdmin') WITH CHECK (public.mi_rol() = 'SuperAdmin');
CREATE POLICY usuarios_update_recepcion ON public.usuarios FOR UPDATE TO authenticated
    USING (public.mi_rol() = 'Recepcionista' AND rol = 'Alumno')
    WITH CHECK (public.mi_rol() = 'Recepcionista' AND rol = 'Alumno');

-- planes: todos los leen; solo SuperAdmin los edita
CREATE POLICY planes_select ON public.planes FOR SELECT TO authenticated USING (true);
CREATE POLICY planes_write  ON public.planes FOR ALL TO authenticated
    USING (public.mi_rol() = 'SuperAdmin') WITH CHECK (public.mi_rol() = 'SuperAdmin');

-- alumnos: el alumno ve su ficha; el staff ve todas. Recepción/SuperAdmin editan
-- (fecha_vencimiento NO es editable a mano: ver GRANTs más abajo).
CREATE POLICY alumnos_select ON public.alumnos FOR SELECT TO authenticated
    USING (usuario_id = auth.uid() OR public.es_staff());
CREATE POLICY alumnos_update ON public.alumnos FOR UPDATE TO authenticated
    USING (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'))
    WITH CHECK (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));

-- certificados: el alumno sube y ve los suyos; staff ve todos; recepción/SuperAdmin gestionan
CREATE POLICY certificados_select ON public.certificados_aptos FOR SELECT TO authenticated
    USING (alumno_id = auth.uid() OR public.es_staff());
CREATE POLICY certificados_insert ON public.certificados_aptos FOR INSERT TO authenticated
    WITH CHECK (alumno_id = auth.uid() OR public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));
CREATE POLICY certificados_admin ON public.certificados_aptos FOR ALL TO authenticated
    USING (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'))
    WITH CHECK (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));

-- comprobantes: el alumno sube y ve los suyos; recepción/SuperAdmin ven todos.
-- Aprobar/rechazar SOLO por las funciones aprobar_/rechazar_comprobante.
CREATE POLICY comprobantes_select ON public.comprobantes_pago FOR SELECT TO authenticated
    USING (alumno_id = auth.uid() OR public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));
CREATE POLICY comprobantes_insert ON public.comprobantes_pago FOR INSERT TO authenticated
    WITH CHECK (alumno_id = auth.uid() AND estado = 'Pendiente'
                AND revisado_por IS NULL AND revisado_at IS NULL);

-- turnos: cada uno ve sus turnos (el esperado solo existe una vez cerrado); SuperAdmin ve todos
CREATE POLICY turnos_select ON public.turnos_caja FOR SELECT TO authenticated
    USING (usuario_id = auth.uid() OR public.mi_rol() = 'SuperAdmin');

-- productos: recepción y SuperAdmin leen; SuperAdmin hace el ABM (CU14)
CREATE POLICY productos_select ON public.productos FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));
CREATE POLICY productos_write ON public.productos FOR ALL TO authenticated
    USING (public.mi_rol() = 'SuperAdmin') WITH CHECK (public.mi_rol() = 'SuperAdmin');

-- ventas, ítems e ingresos: SOLO SuperAdmin lee (RNF01). Se escriben por funciones.
CREATE POLICY ventas_select ON public.ventas FOR SELECT TO authenticated
    USING (public.mi_rol() = 'SuperAdmin');
CREATE POLICY venta_items_select ON public.venta_items FOR SELECT TO authenticated
    USING (public.mi_rol() = 'SuperAdmin');
CREATE POLICY ingresos_select ON public.ingresos FOR SELECT TO authenticated
    USING (public.mi_rol() = 'SuperAdmin');

-- espacios de alquiler
CREATE POLICY espacios_select ON public.espacios_alquiler FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));
CREATE POLICY espacios_write ON public.espacios_alquiler FOR ALL TO authenticated
    USING (public.mi_rol() = 'SuperAdmin') WITH CHECK (public.mi_rol() = 'SuperAdmin');

-- asistencias: el alumno ve las suyas; staff ve todas. Alta por registrar_checkin().
CREATE POLICY asistencias_select ON public.asistencias FOR SELECT TO authenticated
    USING (alumno_id = auth.uid() OR public.es_staff());

-- ejercicios: catálogo visible para todos; lo editan Coach/SuperAdmin
CREATE POLICY ejercicios_select ON public.ejercicios FOR SELECT TO authenticated USING (true);
CREATE POLICY ejercicios_write ON public.ejercicios FOR ALL TO authenticated
    USING (public.mi_rol() IN ('Coach', 'SuperAdmin'))
    WITH CHECK (public.mi_rol() IN ('Coach', 'SuperAdmin'));

-- rutinas, días e ítems: el alumno ve las suyas; Coach/SuperAdmin ven y editan todas
CREATE POLICY rutinas_select_alumno ON public.rutinas FOR SELECT TO authenticated
    USING (alumno_id = auth.uid());
CREATE POLICY rutinas_coach ON public.rutinas FOR ALL TO authenticated
    USING (public.mi_rol() IN ('Coach', 'SuperAdmin'))
    WITH CHECK (public.mi_rol() IN ('Coach', 'SuperAdmin'));

CREATE POLICY rutina_dias_select_alumno ON public.rutina_dias FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.rutinas r
                    WHERE r.id = rutina_dias.rutina_id AND r.alumno_id = auth.uid()));
CREATE POLICY rutina_dias_coach ON public.rutina_dias FOR ALL TO authenticated
    USING (public.mi_rol() IN ('Coach', 'SuperAdmin'))
    WITH CHECK (public.mi_rol() IN ('Coach', 'SuperAdmin'));

CREATE POLICY rutina_items_select_alumno ON public.rutina_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.rutina_dias d JOIN public.rutinas r ON r.id = d.rutina_id
                    WHERE d.id = rutina_items.rutina_dia_id AND r.alumno_id = auth.uid()));
CREATE POLICY rutina_items_coach ON public.rutina_items FOR ALL TO authenticated
    USING (public.mi_rol() IN ('Coach', 'SuperAdmin'))
    WITH CHECK (public.mi_rol() IN ('Coach', 'SuperAdmin'));

-- observaciones: SOLO Coach y SuperAdmin (el alumno no las ve, recepción tampoco)
CREATE POLICY observaciones_coach ON public.observaciones_alumno FOR ALL TO authenticated
    USING (public.mi_rol() IN ('Coach', 'SuperAdmin'))
    WITH CHECK (public.mi_rol() IN ('Coach', 'SuperAdmin'));


-- ---------------------------------------------------------------------
-- 17. PERMISOS (GRANTs)
-- ---------------------------------------------------------------------
-- Nadie modifica fecha_vencimiento a mano: solo las funciones de cobro.
REVOKE UPDATE ON public.alumnos FROM anon, authenticated;
GRANT  UPDATE (plan_id, fecha_nacimiento, contacto_emergencia) ON public.alumnos TO authenticated;

-- Nadie cambia el estado de un comprobante ni el contenido de un turno a mano
REVOKE UPDATE, DELETE ON public.comprobantes_pago, public.turnos_caja,
                         public.ingresos, public.ventas, public.venta_items,
                         public.asistencias FROM anon, authenticated;

-- El usuario anónimo (sin login) no accede a nada
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Funciones internas: no se pueden llamar desde el cliente
REVOKE EXECUTE ON FUNCTION public._extender_membresia(UUID), public._turno_abierto(),
                           public._exigir_rol(public.rol_usuario[]),
                           public.fn_nuevo_usuario_auth()
    FROM PUBLIC, anon, authenticated;

-- RPC públicas: solo usuarios logueados
REVOKE EXECUTE ON FUNCTION
    public.registrar_checkin(UUID), public.aprobar_comprobante(UUID, NUMERIC),
    public.rechazar_comprobante(UUID, TEXT), public.registrar_pago_efectivo(UUID),
    public.registrar_venta(JSONB, public.medio_pago),
    public.registrar_cobro_alquiler(UUID, NUMERIC, public.medio_pago, TEXT),
    public.abrir_turno(NUMERIC), public.cerrar_turno(NUMERIC, TEXT),
    public.justificar_cierre(UUID, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
    public.registrar_checkin(UUID), public.aprobar_comprobante(UUID, NUMERIC),
    public.rechazar_comprobante(UUID, TEXT), public.registrar_pago_efectivo(UUID),
    public.registrar_venta(JSONB, public.medio_pago),
    public.registrar_cobro_alquiler(UUID, NUMERIC, public.medio_pago, TEXT),
    public.abrir_turno(NUMERIC), public.cerrar_turno(NUMERIC, TEXT),
    public.justificar_cierre(UUID, TEXT)
TO authenticated;


-- ---------------------------------------------------------------------
-- 18. STORAGE: buckets privados + políticas
--     Convención de rutas:  <alumno_id>/<nombre-archivo>
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('comprobantes', 'comprobantes', false, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('certificados', 'certificados', false, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "comprobantes_insert" ON storage.objects;
DROP POLICY IF EXISTS "comprobantes_select" ON storage.objects;
DROP POLICY IF EXISTS "certificados_insert" ON storage.objects;
DROP POLICY IF EXISTS "certificados_select" ON storage.objects;

CREATE POLICY "comprobantes_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'comprobantes'
                AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "comprobantes_select" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'comprobantes'
           AND ((storage.foldername(name))[1] = auth.uid()::text
                OR public.mi_rol() IN ('Recepcionista', 'SuperAdmin')));

CREATE POLICY "certificados_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'certificados'
                AND ((storage.foldername(name))[1] = auth.uid()::text
                     OR public.mi_rol() IN ('Recepcionista', 'SuperAdmin')));
CREATE POLICY "certificados_select" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'certificados'
           AND ((storage.foldername(name))[1] = auth.uid()::text OR public.es_staff()));


-- =====================================================================
-- 19. DATOS DE PRUEBA (MOCKS)
--     Contraseña de todos: Licurgo2026!
--     ┌───────────────┬──────────┬──────────────────────────────────────┐
--     │ Rol           │ DNI      │ Situación                            │
--     ├───────────────┼──────────┼──────────────────────────────────────┤
--     │ SuperAdmin    │ 20111111 │ Ramiro Licurgo (dueño)               │
--     │ Recepcionista │ 25222222 │ Sofía Paz                            │
--     │ Coach         │ 30111222 │ Martín Gómez                         │
--     │ Alumno        │ 40111001 │ Lucía – al día, con rutina y apto    │
--     │ Alumno        │ 41222002 │ Tomás – vence en 2 días, comp. pend. │
--     │ Alumno        │ 39333003 │ Camila – vencida hace 5 días         │
--     └───────────────┴──────────┴──────────────────────────────────────┘
-- =====================================================================

-- Helper que crea la cuenta en Supabase Auth (el trigger crea el perfil)
CREATE FUNCTION public._crear_usuario_mock(p_id UUID, p_dni TEXT, p_nombre TEXT, p_apellido TEXT,
                                           p_rol public.rol_usuario, p_telefono TEXT,
                                           p_plan_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE v_email TEXT := p_dni || '@licurgo.test';
BEGIN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, email_change,
                            email_change_token_new, recovery_token, email_change_token_current,
                            phone_change, phone_change_token, reauthentication_token)
    VALUES ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
            v_email, extensions.crypt('Licurgo2026!', extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'rol', p_rol),
            jsonb_build_object('dni', p_dni, 'nombre', p_nombre, 'apellido', p_apellido,
                               'telefono', p_telefono, 'plan_id', p_plan_id),
            now(), now(), '', '', '', '', '', '', '', '');

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), p_id, p_id::text,
            jsonb_build_object('sub', p_id::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
    RETURN p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public._crear_usuario_mock FROM PUBLIC, anon, authenticated;

-- 19.1 Planes
INSERT INTO public.planes (id, nombre, precio, dias_por_semana) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Plan 2 veces por semana', 18000, 2),
  ('a0000000-0000-0000-0000-000000000002', 'Plan 3 veces por semana', 22000, 3),
  ('a0000000-0000-0000-0000-000000000003', 'Plan libre',              26000, NULL);

-- 19.2 Usuarios
DO $$
BEGIN
    PERFORM public._crear_usuario_mock('10000000-0000-0000-0000-000000000001', '20111111', 'Ramiro', 'Licurgo',   'SuperAdmin',    '3815550001');
    PERFORM public._crear_usuario_mock('10000000-0000-0000-0000-000000000002', '25222222', 'Sofía',  'Paz',       'Recepcionista', '3815550002');
    PERFORM public._crear_usuario_mock('10000000-0000-0000-0000-000000000003', '30111222', 'Martín', 'Gómez',     'Coach',         '3815550003');
    PERFORM public._crear_usuario_mock('20000000-0000-0000-0000-000000000001', '40111001', 'Lucía',  'Fernández', 'Alumno', '3815552001', 'a0000000-0000-0000-0000-000000000002');
    PERFORM public._crear_usuario_mock('20000000-0000-0000-0000-000000000002', '41222002', 'Tomás',  'Ruiz',      'Alumno', '3815552002', 'a0000000-0000-0000-0000-000000000001');
    PERFORM public._crear_usuario_mock('20000000-0000-0000-0000-000000000003', '39333003', 'Camila', 'Herrera',   'Alumno', '3815552003', 'a0000000-0000-0000-0000-000000000003');
END $$;

-- Vencimientos para probar los tres estados y las alertas
UPDATE public.alumnos SET fecha_vencimiento = public.hoy_ar() + 15, fecha_nacimiento = '2000-07-03'
 WHERE usuario_id = '20000000-0000-0000-0000-000000000001';
UPDATE public.alumnos SET fecha_vencimiento = public.hoy_ar() + 2,  fecha_nacimiento = '2001-11-21'
 WHERE usuario_id = '20000000-0000-0000-0000-000000000002';
UPDATE public.alumnos SET fecha_vencimiento = public.hoy_ar() - 5,  fecha_nacimiento = '1998-02-15'
 WHERE usuario_id = '20000000-0000-0000-0000-000000000003';

-- 19.3 Certificados de aptitud (Lucía vigente, Camila vencido, Tomás sin certificado)
INSERT INTO public.certificados_aptos (alumno_id, archivo_path, fecha_emision, fecha_vencimiento, cargado_por) VALUES
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001/apto-demo.pdf',
   public.hoy_ar() - 30, public.hoy_ar() + 335, '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003/apto-demo.pdf',
   public.hoy_ar() - 400, public.hoy_ar() - 35, '10000000-0000-0000-0000-000000000002');

-- 19.4 Comprobante pendiente de Tomás (para probar CU08)
INSERT INTO public.comprobantes_pago (id, alumno_id, archivo_path, monto_declarado) VALUES
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000002/comprobante-demo.jpg', 18000);

-- 19.5 Catálogo de ejercicios (con progresiones)
INSERT INTO public.ejercicios (nombre, categoria, descripcion) VALUES
  ('Movilidad de hombros y muñecas', 'Movilidad', 'Círculos, rotaciones y apoyos en cuadrupedia'),
  ('Scapular pull-ups',              'Tracción',  'Colgado, retracción y depresión escapular sin flexionar codos'),
  ('Hollow body hold',               'Core',      'Posición de banana, zona lumbar pegada al piso'),
  ('Dominada negativa',              'Tracción',  'Subir con salto y bajar en 5 segundos'),
  ('Dominada asistida con banda',    'Tracción',  'Banda elástica bajo los pies o rodillas'),
  ('Dominada estricta',              'Tracción',  'Desde colgado completo hasta mentón sobre la barra'),
  ('Remo australiano',               'Tracción',  'Barra baja, cuerpo en tabla'),
  ('Fondos asistidos con banda',     'Empuje',    'En paralelas, banda bajo las rodillas'),
  ('Fondos en paralelas',            'Empuje',    'Hombros por debajo de los codos al bajar'),
  ('Flexiones',                      'Empuje',    'Manos al ancho de hombros, cuerpo en bloque'),
  ('Flexiones diamante',             'Empuje',    'Manos juntas formando un rombo'),
  ('Elevaciones de rodillas colgado','Core',      'Sin balanceo, rodillas al pecho'),
  ('Plancha lateral',                'Core',      'Cadera alineada'),
  ('Sentadilla búlgara',             'Piernas',   'Pie trasero elevado en banco'),
  ('Tuck planche',                   'Skill',     'Rodillas al pecho, hombros por delante de las manos');

UPDATE public.ejercicios SET prerrequisito_id = (SELECT id FROM public.ejercicios WHERE nombre = 'Dominada negativa')
 WHERE nombre = 'Dominada asistida con banda';
UPDATE public.ejercicios SET prerrequisito_id = (SELECT id FROM public.ejercicios WHERE nombre = 'Dominada asistida con banda')
 WHERE nombre = 'Dominada estricta';
UPDATE public.ejercicios SET prerrequisito_id = (SELECT id FROM public.ejercicios WHERE nombre = 'Fondos asistidos con banda')
 WHERE nombre = 'Fondos en paralelas';
UPDATE public.ejercicios SET prerrequisito_id = (SELECT id FROM public.ejercicios WHERE nombre = 'Flexiones')
 WHERE nombre = 'Flexiones diamante';

-- 19.6 Rutina de Lucía: 2 días, 3 bloques por día
INSERT INTO public.rutinas (id, alumno_id, coach_id, nombre, objetivo) VALUES
  ('c0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003', 'Fuerza básica – tren superior',
   'Lograr la primera dominada estricta en 8 semanas');

INSERT INTO public.rutina_dias (id, rutina_id, numero_dia, nombre) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1, 'Tracción + Core'),
  ('c1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 2, 'Empuje + Piernas');

INSERT INTO public.rutina_items (rutina_dia_id, ejercicio_id, bloque, orden, series, repeticiones, descanso_seg, nota)
SELECT x.dia::uuid, e.id, x.bloque::public.bloque_ejercicio, x.orden, x.series, x.reps, x.descanso, x.nota
  FROM (VALUES
    ('c1000000-0000-0000-0000-000000000001', 'Movilidad de hombros y muñecas', 'Entrada en calor', 1, 1, '5 min', NULL, NULL),
    ('c1000000-0000-0000-0000-000000000001', 'Scapular pull-ups',              'Entrada en calor', 2, 2, '10',    60,  NULL),
    ('c1000000-0000-0000-0000-000000000001', 'Hollow body hold',               'Entrada en calor', 3, 3, '20s',   45,  NULL),
    ('c1000000-0000-0000-0000-000000000001', 'Dominada negativa',              'Fuerza',           4, 4, '5',     120, 'Bajada de 5 segundos'),
    ('c1000000-0000-0000-0000-000000000001', 'Remo australiano',               'Fuerza',           5, 4, '10',    90,  NULL),
    ('c1000000-0000-0000-0000-000000000001', 'Elevaciones de rodillas colgado','Accesorios',       6, 3, '10',    60,  NULL),
    ('c1000000-0000-0000-0000-000000000002', 'Movilidad de hombros y muñecas', 'Entrada en calor', 1, 1, '5 min', NULL, 'Cuidar muñeca izquierda'),
    ('c1000000-0000-0000-0000-000000000002', 'Fondos asistidos con banda',     'Fuerza',           2, 4, '8',     120, NULL),
    ('c1000000-0000-0000-0000-000000000002', 'Sentadilla búlgara',             'Fuerza',           3, 4, '8 c/pierna', 90, NULL),
    ('c1000000-0000-0000-0000-000000000002', 'Flexiones diamante',             'Accesorios',       4, 3, '12',    60,  'Sobre paralelas bajas'),
    ('c1000000-0000-0000-0000-000000000002', 'Plancha lateral',                'Accesorios',       5, 3, '30s c/lado', 45, NULL)
  ) AS x(dia, ejercicio, bloque, orden, series, reps, descanso, nota)
  JOIN public.ejercicios e ON e.nombre = x.ejercicio;

-- 19.7 Observaciones (CU10)
INSERT INTO public.observaciones_alumno (alumno_id, coach_id, tipo, titulo, descripcion) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Lesión',
   'Molestia muñeca izquierda', 'Dolor leve en extensión. Evitar handstand y flexiones en el piso; usar paralelas bajas.'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Progresión técnica',
   'Negativas controladas', 'Logra 5 s de bajada. Próximo paso: dominada asistida con banda liviana.'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'Movilidad',
   'Cadera rígida', 'Falta de movilidad en flexión de cadera; sumar trabajo de pancake antes de piernas.');

-- 19.8 Kiosco y espacios
INSERT INTO public.productos (id, nombre, precio, stock) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Agua 500 ml',             1000, 24),
  ('d0000000-0000-0000-0000-000000000002', 'Bebida isotónica 500 ml', 1800, 12),
  ('d0000000-0000-0000-0000-000000000003', 'Barra proteica',          2500, 10),
  ('d0000000-0000-0000-0000-000000000004', 'Mix de frutos secos',     1500, 15);

INSERT INTO public.espacios_alquiler (id, nombre, locatario, canon_sugerido) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Sector funcional – sábados', 'Clase de yoga (prof. invitada)', 40000);

-- 19.9 Historial de AYER para probar dashboard y arqueo (turno ya cerrado, con faltante de $500)
INSERT INTO public.turnos_caja (id, usuario_id, abierto_at, monto_inicial) VALUES
  ('f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
   now() - interval '1 day 8 hours', 5000);

INSERT INTO public.ventas (id, vendedor_id, medio_pago, turno_id, total, created_at) VALUES
  ('f1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Efectivo',
   'f0000000-0000-0000-0000-000000000001', 3500, now() - interval '1 day 5 hours'),
  ('f1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Transferencia',
   NULL, 2500, now() - interval '1 day 4 hours');
INSERT INTO public.venta_items (venta_id, producto_id, cantidad, precio_unitario) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 1000),
  ('f1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 1, 2500),
  ('f1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 1, 2500);

INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, venta_id, espacio_id, turno_id, registrado_por, detalle, created_at) VALUES
  ('Cuota',       'Efectivo',      22000, '20000000-0000-0000-0000-000000000001', NULL, NULL,
   'f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Cuota - Efectivo', now() - interval '1 day 6 hours'),
  ('Kiosco',      'Efectivo',       3500, NULL, 'f1000000-0000-0000-0000-000000000001', NULL,
   'f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', NULL, now() - interval '1 day 5 hours'),
  ('Kiosco',      'Transferencia',  2500, NULL, 'f1000000-0000-0000-0000-000000000002', NULL,
   NULL, '10000000-0000-0000-0000-000000000002', NULL, now() - interval '1 day 4 hours'),
  ('Subalquiler', 'Efectivo',      40000, NULL, NULL, 'e0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Yoga sábados', now() - interval '1 day 3 hours'),
  ('Cuota',       'Transferencia', 26000, '20000000-0000-0000-0000-000000000003', NULL, NULL,
   NULL, '10000000-0000-0000-0000-000000000001', 'Cuota - Transferencia', now() - interval '1 day 2 hours');

-- Cierre: esperado 5.000 + 22.000 + 3.500 + 40.000 = 70.500 · contado 70.000 → diferencia -500
UPDATE public.turnos_caja
   SET cerrado_at = now() - interval '1 day', monto_contado = 70000, monto_esperado = 70500,
       comentario = 'Faltante: vuelto mal dado en una cuota'
 WHERE id = 'f0000000-0000-0000-0000-000000000001';

-- Asistencias de ayer
INSERT INTO public.asistencias (alumno_id, registrado_por, fecha_hora, fecha) VALUES
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now() - interval '1 day 2 hours', public.hoy_ar() - 1),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', now() - interval '1 day 1 hour',  public.hoy_ar() - 1);


-- ---------------------------------------------------------------------
-- 20. VERIFICACIÓN RÁPIDA (el SQL Editor corre como admin y ve todo)
-- ---------------------------------------------------------------------
SELECT nombre, apellido, plan, dias_restantes, estado_membresia, estado_certificado
  FROM public.v_membresias ORDER BY dias_restantes;
