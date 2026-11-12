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
                    public.v_invitaciones_pendientes,
                    public.v_ingresos_diarios, public.v_concurrencia,
                    public.v_rutina_alumno, public.v_alumnos_baja, public.v_cierres_caja, public.v_personal, public.v_movimientos CASCADE;

DROP TABLE IF EXISTS
    -- esquema v1 (modulo_coach.sql)
    public.fichas_observaciones, public.item_ejercicio, public.rutina_dia,
    -- esquema v2
    public.configuracion_admin, public.pase_libre_historial, public.datos_cobro, public.dias_completados, public.rutinas_plantilla, public.observaciones_alumno, public.rutina_items, public.rutina_dias, public.rutinas,
    public.ejercicios, public.invitaciones_retomar, public.asistencias, public.ingresos, public.venta_items,
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
    public.fn_tocar_rutina, public.registrar_checkin, public.metricas_concurrencia, public.whatsapp_contacto, public.aprobar_comprobante,
    public.rechazar_comprobante, public.registrar_pago_efectivo, public.registrar_venta,
    public.registrar_cobro_alquiler, public.abrir_turno, public.cerrar_turno,
    public.justificar_cierre, public.registrar_invitacion, public._crear_usuario_mock,
    public.fn_validar_progresion, public.guardar_rutina, public.fn_tocar_plantilla,
    -- Pareja A · A1
    public._plan_unico, public.marcar_clave_cambiada, public.alta_clase_prueba,
    public._alumno_existente, public.editar_alumno, public.dar_baja_alumno,
    public.reactivar_alumno, public._normalizar_email, public._datos_faltantes,
    public.cargar_stock, public.registrar_pago_cuota, public.marcar_cierre_revisado,
    -- Pareja A · A6
    public._generar_clave, public._personal_editable, public.alta_personal, public.editar_personal,
    public.cambiar_estado_personal, public.restablecer_clave_personal,
    public.asignar_pase_libre, public.quitar_pase_libre,
    -- Pareja A · A7
    public.guardar_planilla_url CASCADE;

-- Usuarios mock de Supabase Auth (por DNI)
DELETE FROM auth.users
 WHERE email IN ('20111111@licurgo.test', '25222222@licurgo.test', '30111222@licurgo.test',
                 '40111001@licurgo.test', '41222002@licurgo.test', '39333003@licurgo.test',
                 '43444004@licurgo.test', '38555005@licurgo.test');


-- ---------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- ---------------------------------------------------------------------
CREATE TYPE public.rol_usuario         AS ENUM ('SuperAdmin', 'Recepcionista', 'Coach', 'Alumno');
CREATE TYPE public.bloque_ejercicio    AS ENUM ('Entrada en calor', 'Fuerza', 'Accesorios', 'Estiramientos');
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
LANGUAGE sql STABLE SET search_path = '' AS $$
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
    fecha_alta           DATE NOT NULL DEFAULT public.hoy_ar(),
    fecha_clase_prueba   DATE NOT NULL DEFAULT public.hoy_ar()   -- base de la invitación a retomar
);
-- Estado del alumno (calculado en v_membresias, no se guarda):
--   En clase de prueba → nunca pagó · Activo → pagó · Inactivo → venció hace más de 30 días
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
-- 10.1 INVITACIONES A RETOMAR
--      Recepción abre WhatsApp con el mensaje armado, lo envía a mano y
--      deja registrada la invitación (clase de prueba sin pagar o inactivo).
-- ---------------------------------------------------------------------
CREATE TABLE public.invitaciones_retomar (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id    UUID NOT NULL REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    motivo       TEXT NOT NULL CHECK (motivo IN ('Clase de prueba', 'Inactivo')),
    enviada_por  UUID NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id),
    enviada_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invitaciones_alumno ON public.invitaciones_retomar (alumno_id, enviada_at DESC);


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
    nota           TEXT,                             -- observación visible para el alumno (ⓘ)
    grupo          SMALLINT CHECK (grupo > 0),       -- bi-serie: mismo número = se hacen seguidos sin descanso
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

-- Progresiones de ejercicios sin ciclos (A → B → C → A)  [B1]
CREATE FUNCTION public.fn_validar_progresion() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.prerrequisito_id IS NULL THEN
        RETURN NEW;
    END IF;
    -- Recorre la cadena de prerrequisitos hacia atrás desde el nuevo prerrequisito
    IF EXISTS (
        WITH RECURSIVE cadena(id) AS (
            SELECT NEW.prerrequisito_id
            UNION
            SELECT e.prerrequisito_id
              FROM public.ejercicios e JOIN cadena c ON e.id = c.id
             WHERE e.prerrequisito_id IS NOT NULL
        )
        SELECT 1 FROM cadena WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'PROGRESION_CICLICA: el prerrequisito elegido depende de este ejercicio';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_ejercicios_progresion BEFORE INSERT OR UPDATE OF prerrequisito_id ON public.ejercicios
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_progresion();

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


-- 14.1 Check-in (CU03). Solo Recepción/SuperAdmin. La cuota vencida NO bloquea: se avisa en pantalla.
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

-- 14.10 Guardar rutina completa (CU09)  [B1]
--   p_rutina_id NULL → archiva la rutina activa y crea una nueva (queda historial)
--   p_rutina_id dado → edita esa rutina activa reemplazando días e ítems
--   p_dias: [{ nombre, items: [{ ejercicio_id, bloque, series, repeticiones, descanso_seg, nota, grupo }] }]
--   grupo: bi-serie (mismo número dentro del día = seguidos sin descanso; descansa el último)
--   Entrada en calor y Estiramientos: sin descanso ni bi-series (se limpian al guardar)
--   Día 1..n y orden de ítems (por bloque, luego posición) los calcula la función.
CREATE FUNCTION public.guardar_rutina(
    p_alumno_id UUID, p_nombre TEXT, p_objetivo TEXT, p_dias JSONB, p_rutina_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rutina UUID;
    v_dia    RECORD;
    v_dia_id UUID;
BEGIN
    PERFORM public._exigir_rol('{Coach,SuperAdmin}');

    -- Bloquea al alumno: dos coaches guardando a la vez se ejecutan en fila
    PERFORM 1 FROM public.alumnos a JOIN public.usuarios u ON u.id = a.usuario_id
     WHERE a.usuario_id = p_alumno_id AND u.activo
       FOR UPDATE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', p_alumno_id;
    END IF;

    IF coalesce(trim(p_nombre), '') = '' THEN
        RAISE EXCEPTION 'RUTINA_INVALIDA: la rutina necesita un nombre';
    END IF;
    IF jsonb_typeof(p_dias) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_dias) NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION 'RUTINA_SIN_DIAS: la rutina debe tener entre 1 y 7 días';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_dias) d
                WHERE jsonb_typeof(d->'items') IS DISTINCT FROM 'array'
                   OR jsonb_array_length(d->'items') = 0) THEN
        RAISE EXCEPTION 'DIA_VACIO: cada día necesita al menos un ejercicio';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_dias) d, jsonb_array_elements(d->'items') i
                WHERE coalesce(i->>'ejercicio_id', '') = ''
                   OR coalesce(trim(i->>'repeticiones'), '') = ''
                   OR coalesce((i->>'series')::int, 0) < 1) THEN
        RAISE EXCEPTION 'RUTINA_INVALIDA: cada ejercicio necesita ejercicio, series y repeticiones';
    END IF;

    IF p_rutina_id IS NULL THEN
        UPDATE public.rutinas SET activa = false WHERE alumno_id = p_alumno_id AND activa;
        INSERT INTO public.rutinas (alumno_id, coach_id, nombre, objetivo)
        VALUES (p_alumno_id, auth.uid(), trim(p_nombre), nullif(trim(p_objetivo), ''))
        RETURNING id INTO v_rutina;
    ELSE
        UPDATE public.rutinas
           SET nombre = trim(p_nombre), objetivo = nullif(trim(p_objetivo), ''), coach_id = auth.uid()
         WHERE id = p_rutina_id AND alumno_id = p_alumno_id AND activa
        RETURNING id INTO v_rutina;
        IF v_rutina IS NULL THEN
            RAISE EXCEPTION 'RUTINA_NO_ENCONTRADA: la rutina ya no está activa; recargá la pantalla';
        END IF;
        DELETE FROM public.rutina_dias WHERE rutina_id = v_rutina;   -- los ítems caen por CASCADE
    END IF;

    FOR v_dia IN SELECT d.value AS dia, d.ordinality::smallint AS numero
                   FROM jsonb_array_elements(p_dias) WITH ORDINALITY d
    LOOP
        INSERT INTO public.rutina_dias (rutina_id, numero_dia, nombre)
        VALUES (v_rutina, v_dia.numero, nullif(trim(v_dia.dia->>'nombre'), ''))
        RETURNING id INTO v_dia_id;

        INSERT INTO public.rutina_items (rutina_dia_id, ejercicio_id, bloque, orden, series,
                                         repeticiones, descanso_seg, nota, grupo)
        SELECT v_dia_id,
               (i.value->>'ejercicio_id')::uuid,
               (i.value->>'bloque')::public.bloque_ejercicio,
               row_number() OVER (ORDER BY (i.value->>'bloque')::public.bloque_ejercicio, i.ordinality),
               (i.value->>'series')::smallint,
               trim(i.value->>'repeticiones'),
               nullif(i.value->>'descanso_seg', '')::smallint,
               nullif(trim(i.value->>'nota'), ''),
               nullif(i.value->>'grupo', '')::smallint
          FROM jsonb_array_elements(v_dia.dia->'items') WITH ORDINALITY i;

        -- Entrada en calor y Estiramientos no llevan descanso ni bi-series
        UPDATE public.rutina_items SET descanso_seg = NULL, grupo = NULL
         WHERE rutina_dia_id = v_dia_id AND bloque IN ('Entrada en calor', 'Estiramientos')
           AND (descanso_seg IS NOT NULL OR grupo IS NOT NULL);

        -- Bi-series: 2+ ejercicios seguidos del mismo bloque con el mismo grupo
        IF EXISTS (
            SELECT 1 FROM public.rutina_items
             WHERE rutina_dia_id = v_dia_id AND grupo IS NOT NULL
             GROUP BY grupo
            HAVING count(*) < 2 OR count(DISTINCT bloque) > 1
                OR max(orden) - min(orden) + 1 <> count(*)
        ) THEN
            RAISE EXCEPTION 'BISERIE_INVALIDA: una bi-serie necesita 2 o más ejercicios seguidos del mismo bloque';
        END IF;
        -- Dentro de la bi-serie solo el último ejercicio lleva descanso
        UPDATE public.rutina_items ri SET descanso_seg = NULL
         WHERE ri.rutina_dia_id = v_dia_id AND ri.grupo IS NOT NULL AND ri.descanso_seg IS NOT NULL
           AND ri.orden < (SELECT max(x.orden) FROM public.rutina_items x
                            WHERE x.rutina_dia_id = v_dia_id AND x.grupo = ri.grupo);
    END LOOP;

    RETURN v_rutina;
END $$;


-- 14.10 Registrar invitación a retomar (después de enviarla por WhatsApp)
CREATE FUNCTION public.registrar_invitacion(p_alumno_id UUID, p_motivo TEXT)
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
CREATE VIEW public.v_alertas WITH (security_invoker = true) AS
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

-- Rutina activa completa (para el alumno y para el panel del coach)
CREATE VIEW public.v_rutina_alumno WITH (security_invoker = true) AS
SELECT r.id AS rutina_id, r.alumno_id, r.coach_id, r.nombre AS rutina, r.objetivo,
       r.fecha_actualizacion, d.id AS rutina_dia_id, d.numero_dia, d.nombre AS dia,
       i.id AS item_id, i.bloque, i.orden, e.id AS ejercicio_id, e.nombre AS ejercicio,
       e.categoria, e.video_url, i.series, i.repeticiones, i.descanso_seg, i.nota,
       e.descripcion, i.grupo
  FROM public.rutinas r
  JOIN public.rutina_dias d       ON d.rutina_id = r.id
  LEFT JOIN public.rutina_items i ON i.rutina_dia_id = d.id
  LEFT JOIN public.ejercicios e   ON e.id = i.ejercicio_id
 WHERE r.activa;

-- Pendientes de invitar:
--   · en clase de prueba hace 7 días o más, sin pagar y sin invitación previa
--   · inactivos que no fueron invitados desde que pasaron a inactivos
CREATE VIEW public.v_invitaciones_pendientes WITH (security_invoker = true) AS
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
ALTER TABLE public.invitaciones_retomar ENABLE ROW LEVEL SECURITY;
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

-- invitaciones a retomar: solo Recepción y SuperAdmin. Alta por registrar_invitacion().
CREATE POLICY invitaciones_select ON public.invitaciones_retomar FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('Recepcionista', 'SuperAdmin'));

-- asistencias: el alumno ve las suyas; staff ve todas. Alta SOLO por registrar_checkin() (recepción).
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
GRANT  UPDATE (plan_id, fecha_nacimiento, contacto_emergencia, fecha_clase_prueba) ON public.alumnos TO authenticated;

-- Nadie cambia el estado de un comprobante ni el contenido de un turno a mano
REVOKE UPDATE, DELETE ON public.comprobantes_pago, public.turnos_caja,
                         public.ingresos, public.ventas, public.venta_items,
                         public.asistencias FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invitaciones_retomar FROM anon, authenticated;

-- El usuario anónimo (sin login) no accede a nada
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Funciones internas: no se pueden llamar desde el cliente
REVOKE EXECUTE ON FUNCTION public._extender_membresia(UUID), public._turno_abierto(),
                           public._exigir_rol(public.rol_usuario[]),
                           public.fn_nuevo_usuario_auth()
    FROM PUBLIC, anon, authenticated;

-- Funciones de trigger: fuera de la API (los triggers se disparan igual)
REVOKE EXECUTE ON FUNCTION public.fn_tocar_rutina(), public.fn_validar_roles_coach_alumno()
    FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
    IF to_regprocedure('public.fn_validar_progresion()') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.fn_validar_progresion() FROM PUBLIC, anon, authenticated;
    END IF;
END $$;

-- Helpers de RLS: solo usuarios logueados (las políticas los necesitan)
REVOKE EXECUTE ON FUNCTION public.mi_rol(), public.es_staff() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mi_rol(), public.es_staff() TO authenticated, service_role;

-- RPC públicas: solo usuarios logueados
REVOKE EXECUTE ON FUNCTION
    public.registrar_checkin(UUID), public.aprobar_comprobante(UUID, NUMERIC),
    public.rechazar_comprobante(UUID, TEXT), public.registrar_pago_efectivo(UUID),
    public.registrar_venta(JSONB, public.medio_pago),
    public.registrar_cobro_alquiler(UUID, NUMERIC, public.medio_pago, TEXT),
    public.abrir_turno(NUMERIC), public.cerrar_turno(NUMERIC, TEXT),
    public.justificar_cierre(UUID, TEXT), public.registrar_invitacion(UUID, TEXT),
    public.guardar_rutina(UUID, TEXT, TEXT, JSONB, UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
    public.registrar_checkin(UUID), public.aprobar_comprobante(UUID, NUMERIC),
    public.rechazar_comprobante(UUID, TEXT), public.registrar_pago_efectivo(UUID),
    public.registrar_venta(JSONB, public.medio_pago),
    public.registrar_cobro_alquiler(UUID, NUMERIC, public.medio_pago, TEXT),
    public.abrir_turno(NUMERIC), public.cerrar_turno(NUMERIC, TEXT),
    public.justificar_cierre(UUID, TEXT), public.registrar_invitacion(UUID, TEXT),
    public.guardar_rutina(UUID, TEXT, TEXT, JSONB, UUID)
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
--     │ Alumno        │ 43444004 │ Valentina – clase de prueba, no pagó │
--     │ Alumno        │ 38555005 │ Diego – inactivo (venció hace 40 d.) │
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
    PERFORM public._crear_usuario_mock('20000000-0000-0000-0000-000000000004', '43444004', 'Valentina', 'Sosa',   'Alumno', '3815552004');
    PERFORM public._crear_usuario_mock('20000000-0000-0000-0000-000000000005', '38555005', 'Diego',  'Luna',      'Alumno', '3815552005', 'a0000000-0000-0000-0000-000000000001');
END $$;

-- Valentina hizo la clase de prueba hace 8 días; Diego dejó de venir (venció hace 40 días)
UPDATE public.alumnos SET fecha_clase_prueba = public.hoy_ar() - 8
 WHERE usuario_id = '20000000-0000-0000-0000-000000000004';
UPDATE public.alumnos SET fecha_clase_prueba = public.hoy_ar() - 100, fecha_vencimiento = public.hoy_ar() - 40
 WHERE usuario_id = '20000000-0000-0000-0000-000000000005';

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

-- Calentamiento de piernas y estiramientos  [B1 · iteración 3]
INSERT INTO public.ejercicios (nombre, categoria, descripcion) VALUES
  ('Movilidad de tobillos',             'Movilidad', 'Rodilla hacia adelante sin levantar el talón, alternando lados'),
  ('Puente de glúteos',                 'Piernas',   'Boca arriba, rodillas flexionadas, subir la cadera apretando glúteos'),
  ('Estiramiento de pectoral en pared', 'Movilidad', 'Brazo apoyado en la pared a la altura del hombro, girar el torso hacia el lado contrario'),
  ('Estiramiento de dorsal colgado',    'Movilidad', 'Colgado de la barra con agarre cómodo, relajar hombros y dejar que el cuerpo pese'),
  ('Estiramiento de tríceps',           'Movilidad', 'Codo por detrás de la cabeza, empujar suave con la otra mano'),
  ('Estiramiento de antebrazos',        'Movilidad', 'Brazo extendido, llevar los dedos hacia atrás con la otra mano, palma arriba y abajo'),
  ('Estiramiento de isquiotibiales',    'Movilidad', 'Piernas extendidas, bajar con la espalda recta hacia los pies'),
  ('Estiramiento de cuádriceps',        'Movilidad', 'De pie, llevar el talón al glúteo con las rodillas juntas'),
  ('Estiramiento de cadera (paloma)',   'Movilidad', 'Pierna de adelante flexionada y la de atrás extendida, bajar la cadera hacia el piso'),
  ('Estiramiento de gemelos',           'Movilidad', 'Manos en la pared, pierna de atrás extendida con el talón apoyado')
ON CONFLICT (nombre) DO NOTHING;

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
    ('c1000000-0000-0000-0000-000000000001', 'Scapular pull-ups',              'Entrada en calor', 2, 2, '10',    NULL,  NULL),
    ('c1000000-0000-0000-0000-000000000001', 'Hollow body hold',               'Entrada en calor', 3, 3, '20s',   NULL,  NULL),
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
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', now() - interval '1 day 2 hours', public.hoy_ar() - 1),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', now() - interval '1 day 1 hour',  public.hoy_ar() - 1);


-- ---------------------------------------------------------------------
-- 19.9 PAREJA A · A1 GESTIONAR ALUMNOS (migraciones 20261107_01 a 03)
--      Plan único, alta de clase de prueba, cambio de clave obligatorio,
--      edición, baja lógica, reactivación y ficha completa al pagar.
--      Va después del seed porque deja una sola fila en planes.
-- ---------------------------------------------------------------------

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
-- 19.10 PAREJA B · B1 ITERACIÓN 2: PLANTILLAS DE RUTINA Y CALENTAMIENTO ESTÁNDAR
--       (migraciones 20261110_01 a 03; la 01 y la 02 tocan secciones 11, 14.10 y 15)
--     Rutinas preestablecidas que el coach usa como base. tipo 'Calentamiento'
--     = calentamiento estándar (uno solo activo). `dias` = formato p_dias.
--     Solo Coach y SuperAdmin.
-- ---------------------------------------------------------------------
CREATE TABLE public.rutinas_plantilla (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo                 TEXT NOT NULL DEFAULT 'Rutina' CHECK (tipo IN ('Rutina', 'Calentamiento')),
    nombre               TEXT NOT NULL CHECK (trim(nombre) <> ''),
    objetivo             TEXT,
    dias                 JSONB NOT NULL
                         CHECK (jsonb_typeof(dias) = 'array' AND jsonb_array_length(dias) BETWEEN 1 AND 7),
    activa               BOOLEAN NOT NULL DEFAULT TRUE,
    creada_por           UUID DEFAULT auth.uid() REFERENCES public.usuarios(id) ON DELETE SET NULL,
    fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_plantilla_nombre
    ON public.rutinas_plantilla (lower(trim(nombre))) WHERE activa;
CREATE UNIQUE INDEX uq_un_calentamiento
    ON public.rutinas_plantilla (tipo) WHERE activa AND tipo = 'Calentamiento';

CREATE FUNCTION public.fn_tocar_plantilla() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    NEW.fecha_actualizacion := now();
    RETURN NEW;
END $$;
CREATE TRIGGER trg_plantillas_fecha BEFORE UPDATE ON public.rutinas_plantilla
    FOR EACH ROW EXECUTE FUNCTION public.fn_tocar_plantilla();

ALTER TABLE public.rutinas_plantilla ENABLE ROW LEVEL SECURITY;
CREATE POLICY plantillas_coach ON public.rutinas_plantilla FOR ALL TO authenticated
    USING (public.mi_rol() IN ('Coach', 'SuperAdmin'))
    WITH CHECK (public.mi_rol() IN ('Coach', 'SuperAdmin'));
REVOKE ALL ON public.rutinas_plantilla FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.rutinas_plantilla TO authenticated;
REVOKE DELETE ON public.rutinas_plantilla FROM authenticated;   -- baja lógica


-- ---------------------------------------------------------------------
-- Datos iniciales (se pueden editar desde la app: Coach → Plantillas)
-- ---------------------------------------------------------------------

-- Ejercicios de calentamiento que faltaban en el catálogo
INSERT INTO public.ejercicios (nombre, categoria, descripcion) VALUES
  ('Movilidad articular general', 'Movilidad', 'Cuello, hombros, cadera, rodillas y tobillos: círculos suaves en ambos sentidos'),
  ('Jumping jacks',               'Movilidad', 'Saltos abriendo y cerrando brazos y piernas, ritmo constante'),
  ('Sentadilla libre',            'Piernas',   'Pies al ancho de hombros, bajar con la espalda recta y talones apoyados')
ON CONFLICT (nombre) DO NOTHING;

-- Ítem de plantilla a partir del nombre del ejercicio (si no existe queda sin elegir)
CREATE OR REPLACE FUNCTION pg_temp.it(p_nombre TEXT, p_bloque TEXT, p_series INT, p_reps TEXT,
                                      p_descanso INT DEFAULT NULL, p_grupo INT DEFAULT NULL, p_nota TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'ejercicio_id', (SELECT id FROM public.ejercicios WHERE nombre = p_nombre),
        'bloque', p_bloque, 'series', p_series, 'repeticiones', p_reps,
        'descanso_seg', p_descanso, 'grupo', p_grupo, 'nota', p_nota)
$$;

INSERT INTO public.rutinas_plantilla (tipo, nombre, objetivo, dias, creada_por)
SELECT 'Calentamiento', 'Calentamiento estándar', NULL, jsonb_build_array(jsonb_build_object(
    'nombre', 'Calentamiento',
    'items', jsonb_build_array(
        pg_temp.it('Jumping jacks',                  'Entrada en calor', 2, '30s'),
        pg_temp.it('Movilidad articular general',    'Entrada en calor', 1, '3 min'),
        pg_temp.it('Movilidad de hombros y muñecas', 'Entrada en calor', 1, '2 min'),
        pg_temp.it('Scapular pull-ups',              'Entrada en calor', 2, '10'),
        pg_temp.it('Sentadilla libre',               'Entrada en calor', 2, '15')))), NULL
WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla WHERE tipo = 'Calentamiento' AND activa);

INSERT INTO public.rutinas_plantilla (tipo, nombre, objetivo, dias, creada_por)
SELECT 'Rutina', 'Fuerza básica', 'Base de fuerza en tracción, empuje y piernas', jsonb_build_array(
    jsonb_build_object('nombre', 'Tren superior', 'items', jsonb_build_array(
        pg_temp.it('Dominada asistida con banda', 'Fuerza',     4, '6',   NULL, 1),  -- bi-serie con fondos
        pg_temp.it('Fondos asistidos con banda',  'Fuerza',     4, '8',   120, 1),
        pg_temp.it('Remo australiano',            'Fuerza',     3, '10',  90),
        pg_temp.it('Hollow body hold',            'Accesorios', 3, '30s', 60),
        pg_temp.it('Plancha lateral',             'Accesorios', 3, '20s', 60, NULL, 'Cada lado'))),
    jsonb_build_object('nombre', 'Empuje + Piernas', 'items', jsonb_build_array(
        pg_temp.it('Flexiones',                       'Fuerza',     4, '10'),
        pg_temp.it('Sentadilla búlgara',              'Fuerza',     3, '8',  90, NULL, 'Cada pierna'),
        pg_temp.it('Dominada negativa',               'Fuerza',     3, '5',  120),
        pg_temp.it('Elevaciones de rodillas colgado', 'Accesorios', 3, '10', 60)))), NULL
WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla WHERE lower(nombre) = 'fuerza básica' AND activa);



-- ---------------------------------------------------------------------
-- 19.11 PAREJA B · B1 ITERACIÓN 3: PLANTILLAS POR NIVEL (migración 20261111_03)
--       tipo: Planificación (varios días) · Día (un día completo) · Sección (un bloque)
--       Se aplica sobre la tabla de 19.10 para que el script siga el mismo camino
--       que la base real; el bloque Estiramientos ya está en el enum (sección 2).
-- ---------------------------------------------------------------------
ALTER TABLE public.rutinas_plantilla DROP CONSTRAINT IF EXISTS rutinas_plantilla_tipo_check;
ALTER TABLE public.rutinas_plantilla DROP CONSTRAINT IF EXISTS ck_plantilla_nivel;
ALTER TABLE public.rutinas_plantilla ADD COLUMN IF NOT EXISTS bloque public.bloque_ejercicio;
DROP INDEX IF EXISTS public.uq_un_calentamiento;
DROP INDEX IF EXISTS public.uq_plantilla_nombre;

UPDATE public.rutinas_plantilla
   SET tipo = 'Sección', bloque = 'Entrada en calor',
       nombre = CASE WHEN nombre = 'Calentamiento estándar' THEN 'Calentamiento general' ELSE nombre END
 WHERE tipo = 'Calentamiento';
UPDATE public.rutinas_plantilla
   SET tipo = CASE WHEN jsonb_array_length(dias) = 1 THEN 'Día' ELSE 'Planificación' END
 WHERE tipo = 'Rutina';

ALTER TABLE public.rutinas_plantilla ALTER COLUMN tipo SET DEFAULT 'Planificación';
ALTER TABLE public.rutinas_plantilla ADD CONSTRAINT ck_plantilla_nivel CHECK (
        tipo IN ('Planificación', 'Día', 'Sección')
    AND (tipo = 'Sección') = (bloque IS NOT NULL)
    AND (tipo = 'Planificación' OR jsonb_array_length(dias) = 1));

-- Nombre único entre las activas del mismo nivel (y sección)
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_nombre
    ON public.rutinas_plantilla (tipo, bloque, lower(trim(nombre))) NULLS NOT DISTINCT WHERE activa;

COMMENT ON COLUMN public.rutinas_plantilla.tipo IS
    'Planificación (varios días) · Día (un día completo) · Sección (un bloque, ver columna bloque)';


-- ---------------------------------------------------------------------
-- Plantillas iniciales (ejemplos: el coach las ajusta desde Coach → Plantillas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.it(p_nombre TEXT, p_bloque TEXT, p_series INT, p_reps TEXT,
                                      p_descanso INT DEFAULT NULL, p_grupo INT DEFAULT NULL, p_nota TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'ejercicio_id', (SELECT id FROM public.ejercicios WHERE nombre = p_nombre),
        'bloque', p_bloque, 'series', p_series, 'repeticiones', p_reps,
        'descanso_seg', p_descanso, 'grupo', p_grupo, 'nota', p_nota)
$$;

DROP TABLE IF EXISTS pg_temp.semilla;
CREATE TEMP TABLE semilla (clave TEXT PRIMARY KEY, items JSONB);
INSERT INTO semilla VALUES
('cal_sup', jsonb_build_array(
    pg_temp.it('Jumping jacks',                  'Entrada en calor', 2, '30s'),
    pg_temp.it('Movilidad de hombros y muñecas', 'Entrada en calor', 1, '2 min'),
    pg_temp.it('Scapular pull-ups',              'Entrada en calor', 2, '10'),
    pg_temp.it('Flexiones',                      'Entrada en calor', 1, '8', NULL, NULL, 'Suaves, para entrar en calor'))),
('cal_pie', jsonb_build_array(
    pg_temp.it('Jumping jacks',                  'Entrada en calor', 2, '30s'),
    pg_temp.it('Movilidad de tobillos',          'Entrada en calor', 1, '1 min'),
    pg_temp.it('Movilidad articular general',    'Entrada en calor', 1, '2 min'),
    pg_temp.it('Sentadilla libre',               'Entrada en calor', 2, '15'),
    pg_temp.it('Puente de glúteos',              'Entrada en calor', 2, '12'))),
('est_sup', jsonb_build_array(
    pg_temp.it('Estiramiento de pectoral en pared', 'Estiramientos', 2, '30s', NULL, NULL, 'Cada lado'),
    pg_temp.it('Estiramiento de dorsal colgado',    'Estiramientos', 2, '30s'),
    pg_temp.it('Estiramiento de tríceps',           'Estiramientos', 2, '30s', NULL, NULL, 'Cada lado'),
    pg_temp.it('Estiramiento de antebrazos',        'Estiramientos', 1, '30s'))),
('est_pie', jsonb_build_array(
    pg_temp.it('Estiramiento de isquiotibiales',  'Estiramientos', 2, '30s'),
    pg_temp.it('Estiramiento de cuádriceps',      'Estiramientos', 2, '30s', NULL, NULL, 'Cada pierna'),
    pg_temp.it('Estiramiento de cadera (paloma)', 'Estiramientos', 2, '45s', NULL, NULL, 'Cada lado'),
    pg_temp.it('Estiramiento de gemelos',         'Estiramientos', 2, '30s', NULL, NULL, 'Cada pierna'))),
('fza_sup', jsonb_build_array(
    pg_temp.it('Dominada asistida con banda', 'Fuerza',     4, '6',   NULL, 1),
    pg_temp.it('Fondos asistidos con banda',  'Fuerza',     4, '8',   120, 1),
    pg_temp.it('Remo australiano',            'Fuerza',     3, '10',  90),
    pg_temp.it('Hollow body hold',            'Accesorios', 3, '30s', 60),
    pg_temp.it('Plancha lateral',             'Accesorios', 3, '20s', 60, NULL, 'Cada lado'))),
('fza_pie', jsonb_build_array(
    pg_temp.it('Flexiones',                       'Fuerza',     4, '10'),
    pg_temp.it('Sentadilla búlgara',              'Fuerza',     3, '8',  90, NULL, 'Cada pierna'),
    pg_temp.it('Dominada negativa',               'Fuerza',     3, '5',  120),
    pg_temp.it('Elevaciones de rodillas colgado', 'Accesorios', 3, '10', 60)));

CREATE OR REPLACE FUNCTION pg_temp.s(k TEXT) RETURNS JSONB LANGUAGE sql AS $$ SELECT items FROM semilla WHERE clave = k $$;
CREATE OR REPLACE FUNCTION pg_temp.dia(n TEXT, VARIADIC ks TEXT[]) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object('nombre', n, 'items',
           (SELECT coalesce(jsonb_agg(it.item ORDER BY k.ord, it.ord), '[]'::jsonb)
              FROM unnest(ks) WITH ORDINALITY k(clave, ord),
                   jsonb_array_elements(pg_temp.s(k.clave)) WITH ORDINALITY it(item, ord)))
$$;

-- Secciones: calentamientos y estiramientos por tipo de día
INSERT INTO public.rutinas_plantilla (tipo, bloque, nombre, dias, creada_por)
SELECT 'Sección', x.bloque::public.bloque_ejercicio, x.nombre, jsonb_build_array(pg_temp.dia(x.nombre, x.clave)), NULL
  FROM (VALUES ('Entrada en calor', 'Calentamiento tren superior', 'cal_sup'),
               ('Entrada en calor', 'Calentamiento piernas',       'cal_pie'),
               ('Estiramientos',    'Estiramiento tren superior',  'est_sup'),
               ('Estiramientos',    'Estiramiento piernas',        'est_pie')) x(bloque, nombre, clave)
 WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla p
                    WHERE p.activa AND p.tipo = 'Sección' AND lower(p.nombre) = lower(x.nombre));

-- Días completos (calentamiento + fuerza/accesorios + estiramientos)
INSERT INTO public.rutinas_plantilla (tipo, nombre, dias, creada_por)
SELECT 'Día', x.nombre, jsonb_build_array(pg_temp.dia(x.nombre, x.cal, x.fza, x.est)), NULL
  FROM (VALUES ('Tren superior',    'cal_sup', 'fza_sup', 'est_sup'),
               ('Empuje + Piernas', 'cal_pie', 'fza_pie', 'est_pie')) x(nombre, cal, fza, est)
 WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla p
                    WHERE p.activa AND p.tipo = 'Día' AND lower(p.nombre) = lower(x.nombre));

-- Planificación "Fuerza básica": los dos días completos. Si ya existía tal como
-- se cargó (sin calentamiento), se completa; si el coach la modificó, no se toca.
UPDATE public.rutinas_plantilla
   SET dias = jsonb_build_array(pg_temp.dia('Tren superior', 'cal_sup', 'fza_sup', 'est_sup'),
                                pg_temp.dia('Empuje + Piernas', 'cal_pie', 'fza_pie', 'est_pie'))
 WHERE tipo = 'Planificación' AND nombre = 'Fuerza básica' AND activa
   AND dias::text NOT LIKE '%Entrada en calor%' AND dias::text NOT LIKE '%Estiramientos%';
INSERT INTO public.rutinas_plantilla (tipo, nombre, objetivo, dias, creada_por)
SELECT 'Planificación', 'Fuerza básica', 'Base de fuerza en tracción, empuje y piernas',
       jsonb_build_array(pg_temp.dia('Tren superior', 'cal_sup', 'fza_sup', 'est_sup'),
                         pg_temp.dia('Empuje + Piernas', 'cal_pie', 'fza_pie', 'est_pie')), NULL
 WHERE NOT EXISTS (SELECT 1 FROM public.rutinas_plantilla
                    WHERE activa AND tipo = 'Planificación' AND lower(nombre) = 'fuerza básica');

-- Las plantillas tampoco llevan descanso ni bi-serie en Entrada en calor y Estiramientos
UPDATE public.rutinas_plantilla p
   SET dias = (SELECT jsonb_agg(jsonb_set(d, '{items}', (
                   SELECT coalesce(jsonb_agg(CASE WHEN i->>'bloque' IN ('Entrada en calor', 'Estiramientos')
                                                  THEN i || '{"descanso_seg": null, "grupo": null}'::jsonb ELSE i END
                                             ORDER BY o), '[]'::jsonb)
                     FROM jsonb_array_elements(d->'items') WITH ORDINALITY x(i, o))) ORDER BY n)
                 FROM jsonb_array_elements(p.dias) WITH ORDINALITY y(d, n))
 WHERE p.dias::text ~ '"bloque": "(Entrada en calor|Estiramientos)"';

DROP TABLE IF EXISTS pg_temp.semilla;


-- ---------------------------------------------------------------------
-- 19.12 PAREJA B · B1 ITERACIÓN 4: DÍAS COMPLETADOS EN LA SEMANA (migración 20261111_04)
--       El alumno registra qué día de la rutina terminó; la app abre el próximo pendiente.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dias_completados (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id   UUID NOT NULL DEFAULT auth.uid() REFERENCES public.alumnos(usuario_id) ON DELETE CASCADE,
    rutina_id   UUID NOT NULL REFERENCES public.rutinas(id) ON DELETE CASCADE,
    numero_dia  SMALLINT NOT NULL CHECK (numero_dia BETWEEN 1 AND 7),
    fecha       DATE NOT NULL DEFAULT public.hoy_ar(),
    creado      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dia_completado UNIQUE (alumno_id, rutina_id, numero_dia, fecha)
);
CREATE INDEX IF NOT EXISTS idx_dias_completados_alumno ON public.dias_completados (alumno_id, fecha DESC);

ALTER TABLE public.dias_completados ENABLE ROW LEVEL SECURITY;

-- El alumno marca y desmarca solo sus días, de su propia rutina y con la fecha de hoy
DROP POLICY IF EXISTS dias_completados_alumno_select ON public.dias_completados;
DROP POLICY IF EXISTS dias_completados_alumno_insert ON public.dias_completados;
DROP POLICY IF EXISTS dias_completados_alumno_delete ON public.dias_completados;
DROP POLICY IF EXISTS dias_completados_staff ON public.dias_completados;
CREATE POLICY dias_completados_alumno_select ON public.dias_completados FOR SELECT TO authenticated
    USING (alumno_id = auth.uid());
CREATE POLICY dias_completados_alumno_insert ON public.dias_completados FOR INSERT TO authenticated
    WITH CHECK (alumno_id = auth.uid() AND fecha = public.hoy_ar()
                AND EXISTS (SELECT 1 FROM public.rutinas r WHERE r.id = rutina_id AND r.alumno_id = auth.uid()));
CREATE POLICY dias_completados_alumno_delete ON public.dias_completados FOR DELETE TO authenticated
    USING (alumno_id = auth.uid() AND fecha = public.hoy_ar());
-- Coach y SuperAdmin solo lo consultan
CREATE POLICY dias_completados_staff ON public.dias_completados FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('Coach', 'SuperAdmin'));

REVOKE ALL ON public.dias_completados FROM anon;
REVOKE ALL ON public.dias_completados FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.dias_completados TO authenticated;


-- ---------------------------------------------------------------------
-- 19.13 PAREJA B · B4/B5 COMPROBANTES DE TRANSFERENCIA (migración 20261112_01)
--       Datos de cobro (CBU/alias), un pendiente por alumno, v_comprobantes.
--       La regla de vencimiento la pone A2 (_extender_membresia).
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. Datos para transferir (una sola fila)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.datos_cobro (
    id              BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),   -- fila única
    titular         TEXT,
    banco           TEXT,
    cbu             TEXT CHECK (cbu ~ '^[0-9]{22}$'),
    alias           TEXT CHECK (alias ~ '^[A-Za-z0-9.-]{6,20}$'),
    cuit            TEXT CHECK (cuit ~ '^[0-9]{11}$'),
    actualizado_por UUID REFERENCES public.usuarios(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Arranca vacía: el dueño carga los datos reales desde "Datos de cobro"
INSERT INTO public.datos_cobro (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.datos_cobro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS datos_cobro_select ON public.datos_cobro;
DROP POLICY IF EXISTS datos_cobro_update ON public.datos_cobro;
CREATE POLICY datos_cobro_select ON public.datos_cobro FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY datos_cobro_update ON public.datos_cobro FOR UPDATE TO authenticated
    USING (public.mi_rol() = 'SuperAdmin') WITH CHECK (public.mi_rol() = 'SuperAdmin');
REVOKE ALL ON public.datos_cobro FROM anon, authenticated;
GRANT SELECT ON public.datos_cobro TO authenticated;
GRANT UPDATE (titular, banco, cbu, alias, cuit) ON public.datos_cobro TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_datos_cobro_auditoria() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    NEW.actualizado_por := auth.uid();
    NEW.updated_at := now();
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_datos_cobro_auditoria ON public.datos_cobro;
CREATE TRIGGER trg_datos_cobro_auditoria BEFORE UPDATE ON public.datos_cobro
    FOR EACH ROW EXECUTE FUNCTION public.fn_datos_cobro_auditoria();


-- ---------------------------------------------------------------------
-- 2. Un pendiente por alumno: hasta que recepción lo revise no sube otro
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobante_pendiente_por_alumno
    ON public.comprobantes_pago (alumno_id) WHERE estado = 'Pendiente';


-- ---------------------------------------------------------------------
-- 3. Políticas del comprobante y su archivo
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS comprobantes_insert ON public.comprobantes_pago;
CREATE POLICY comprobantes_insert ON public.comprobantes_pago FOR INSERT TO authenticated
    WITH CHECK (alumno_id = auth.uid()
                AND estado = 'Pendiente' AND revisado_por IS NULL AND revisado_at IS NULL
                AND motivo_rechazo IS NULL
                AND split_part(archivo_path, '/', 1) = auth.uid()::text);

-- Archivo huérfano (se subió pero falló el alta): el alumno lo puede borrar.
-- Un archivo ya registrado como comprobante es evidencia: nadie lo borra.
DROP POLICY IF EXISTS "comprobantes_delete_huerfano" ON storage.objects;
CREATE POLICY "comprobantes_delete_huerfano" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'comprobantes'
           AND (storage.foldername(name))[1] = auth.uid()::text
           AND NOT EXISTS (SELECT 1 FROM public.comprobantes_pago c WHERE c.archivo_path = name));


-- ---------------------------------------------------------------------
-- 4. Vista de comprobantes (RLS de las tablas: el alumno ve los suyos,
--    recepción y SuperAdmin ven todos)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_comprobantes;
CREATE VIEW public.v_comprobantes WITH (security_invoker = true) AS
SELECT
    c.id, c.alumno_id, c.archivo_path, c.monto_declarado, c.estado, c.motivo_rechazo,
    c.created_at, c.revisado_at,
    u.nombre, u.apellido, u.dni, u.telefono,
    a.fecha_vencimiento,
    p.precio                                         AS precio_plan,
    CASE
        WHEN a.fecha_vencimiento IS NULL                    THEN 'En clase de prueba'
        WHEN a.fecha_vencimiento < public.hoy_ar() - 30     THEN 'Inactivo'
        ELSE 'Activo'
    END                                              AS estado_alumno,
    i.monto                                          AS monto_acreditado,
    nullif(trim(coalesce(r.nombre, '') || ' ' || coalesce(r.apellido, '')), '') AS revisado_por_nombre
FROM public.comprobantes_pago c
JOIN public.usuarios u      ON u.id = c.alumno_id
JOIN public.alumnos  a      ON a.usuario_id = c.alumno_id
LEFT JOIN public.planes p   ON p.id = a.plan_id
LEFT JOIN public.ingresos i ON i.comprobante_id = c.id
LEFT JOIN public.usuarios r ON r.id = c.revisado_por;

GRANT SELECT ON public.v_comprobantes TO authenticated;


-- ---------------------------------------------------------------------
-- 5. Aprobar: el monto acreditado tiene que ser positivo
--    (el resto igual: +30 días con la regla de A2 vía _extender_membresia)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprobar_comprobante(p_comprobante_id UUID, p_monto NUMERIC DEFAULT NULL)
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
    IF p_monto IS NOT NULL AND p_monto <= 0 THEN
        RAISE EXCEPTION 'MONTO_INVALIDO';
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

    -- Regla de vencimiento de Pareja A (A2): +30 días; primer pago exige ficha completa
    RETURN public._extender_membresia(v_comp.alumno_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.aprobar_comprobante(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.aprobar_comprobante(UUID, NUMERIC) TO authenticated;


-- ---------------------------------------------------------------------
-- 19.14 PAREJA B · B7 MÉTRICAS DE CONCURRENCIA Y CONTACTO (migración 20261112_02)
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. Métricas de concurrencia (CU13)
--    promedio de una franja = asistencias en esa franja / cuántas veces
--    hubo ese día de la semana en el rango (ej. 4 lunes en 30 días).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.metricas_concurrencia(p_desde DATE, p_hasta DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_hasta DATE := coalesce(p_hasta, public.hoy_ar());
    v_res   JSONB;
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    IF p_desde IS NULL OR v_hasta < p_desde OR v_hasta - p_desde > 366 THEN
        RAISE EXCEPTION 'RANGO_INVALIDO';
    END IF;

    WITH a AS (
        SELECT fecha, fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires' AS local
          FROM public.asistencias
         WHERE fecha BETWEEN p_desde AND v_hasta
    ),
    dias AS (SELECT d::date AS fecha FROM generate_series(p_desde, v_hasta, interval '1 day') d),
    por_dia AS (
        SELECT d.fecha, count(a.fecha) AS n
          FROM dias d LEFT JOIN a ON a.fecha = d.fecha
         GROUP BY d.fecha
    ),
    veces AS (SELECT extract(isodow FROM fecha)::int AS dia, count(*) AS veces FROM dias GROUP BY 1),
    por_dow AS (SELECT extract(isodow FROM fecha)::int AS dia, count(*) AS total FROM a GROUP BY 1),
    franjas AS (
        SELECT extract(isodow FROM local)::int AS dia, extract(hour FROM local)::int AS hora, count(*) AS total
          FROM a GROUP BY 1, 2
    )
    SELECT jsonb_build_object(
        'desde', p_desde,
        'hasta', v_hasta,
        'total', (SELECT count(*) FROM a),
        'dias_con_asistencia', (SELECT count(*) FROM por_dia WHERE n > 0),
        'dias', (SELECT jsonb_agg(jsonb_build_object('fecha', fecha, 'asistencias', n) ORDER BY fecha) FROM por_dia),
        'por_dia_semana', (
            SELECT jsonb_agg(jsonb_build_object(
                       'dia', v.dia, 'veces', v.veces, 'total', coalesce(p.total, 0),
                       'promedio', round(coalesce(p.total, 0)::numeric / v.veces, 1)) ORDER BY v.dia)
              FROM veces v LEFT JOIN por_dow p ON p.dia = v.dia),
        'franjas', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'dia', f.dia, 'hora', f.hora, 'total', f.total,
                       'promedio', round(f.total::numeric / v.veces, 1))), '[]'::jsonb)
              FROM franjas f JOIN veces v ON v.dia = f.dia)
    ) INTO v_res;
    RETURN v_res;
END $$;

REVOKE EXECUTE ON FUNCTION public.metricas_concurrencia(DATE, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metricas_concurrencia(DATE, DATE) TO authenticated;


-- ---------------------------------------------------------------------
-- 2. WhatsApp de contacto (RF13)
-- ---------------------------------------------------------------------
ALTER TABLE public.datos_cobro ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.datos_cobro DROP CONSTRAINT IF EXISTS datos_cobro_whatsapp_check;
ALTER TABLE public.datos_cobro ADD CONSTRAINT datos_cobro_whatsapp_check CHECK (whatsapp ~ '^[0-9]{10}$');
GRANT UPDATE (titular, banco, cbu, alias, cuit, whatsapp) ON public.datos_cobro TO authenticated;

-- El alumno no puede leer los datos del SuperAdmin (RLS de usuarios):
-- esta función le devuelve solo el número de contacto.
CREATE OR REPLACE FUNCTION public.whatsapp_contacto() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(
        (SELECT whatsapp FROM public.datos_cobro WHERE id),
        (SELECT telefono FROM public.usuarios
          WHERE rol = 'SuperAdmin' AND activo AND telefono IS NOT NULL
          ORDER BY created_at LIMIT 1));
$$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_contacto() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.whatsapp_contacto() TO authenticated;


-- ---------------------------------------------------------------------
-- 19.15 PAREJA A · A2 COBRO DE CUOTA (migración 20261108_01)
--       Alumno inactivo que vuelve: los 30 días cuentan desde que paga.
-- ---------------------------------------------------------------------

-- =====================================================================
--  A2 · Cobrar cuota en efectivo (CU06) · Pareja A
--  Regla de vencimiento para alumnos inactivos que vuelven
--
--  Correr en el SQL Editor de Supabase DESPUÉS de las migraciones de A1
--  (20261107_01 a 03). Es re-ejecutable.
--
--  Decisión del equipo (08/11/2026):
--    · Regla general (sin cambios): cada cuota suma +30 días al
--      vencimiento actual, pague antes o unos días tarde.
--    · Alumno INACTIVO (cuota vencida hace más de 30 días): los 30 días
--      cuentan desde el día que paga. Sin esto, alguien que vuelve
--      después de meses pagaría y seguiría con la cuota vencida.
--    · Primer pago: la ficha tiene que estar completa (regla de A1).
--
--  _extender_membresia la usan registrar_pago_efectivo (A2) y
--  aprobar_comprobante (CU08, Pareja B): la regla vale para los dos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._extender_membresia(p_alumno_id UUID) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actual    date;
    v_base      date;
    v_faltantes TEXT[];
    v_nuevo     date;
BEGIN
    SELECT fecha_vencimiento INTO v_actual FROM public.alumnos WHERE usuario_id = p_alumno_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ALUMNO_INEXISTENTE: %', p_alumno_id;
    END IF;

    IF v_actual IS NULL THEN
        -- Primer pago: ficha completa y los 30 días cuentan desde hoy
        v_faltantes := public._datos_faltantes(p_alumno_id);
        IF cardinality(v_faltantes) > 0 THEN
            RAISE EXCEPTION 'FICHA_INCOMPLETA: %', array_to_string(v_faltantes, ', ');
        END IF;
        v_base := public.hoy_ar();
    ELSIF v_actual < public.hoy_ar() - 30 THEN
        -- Inactivo que vuelve: arranca de nuevo desde hoy
        v_base := public.hoy_ar();
    ELSE
        -- Activo (al día, por vencer o vencido hace 30 días o menos)
        v_base := v_actual;
    END IF;

    v_nuevo := v_base + 30;
    UPDATE public.alumnos SET fecha_vencimiento = v_nuevo WHERE usuario_id = p_alumno_id;
    RETURN v_nuevo;
END $$;

REVOKE EXECUTE ON FUNCTION public._extender_membresia(UUID) FROM PUBLIC, anon, authenticated;




-- ---------------------------------------------------------------------
-- 19.16 PAREJA A · A3 KIOSCO: INGRESO DE MERCADERÍA (migración 20261111_01)
-- ---------------------------------------------------------------------

-- =====================================================================
--  A3 · Kiosco: productos y stock (CU14) · Pareja A
--  Ingreso de mercadería
--
--  Correr en el SQL Editor de Supabase. Es re-ejecutable.
--
--  Decisión del dueño (11/11/2026): los productos los maneja SOLO el
--  SuperAdmin (alta, precios, stock y baja). Ya lo garantiza la política
--  productos_write; recepción solo lee y vende.
--
--  cargar_stock suma la mercadería que llega en una sola operación
--  (stock = stock + n), así no pisa una venta que ocurra al mismo tiempo.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cargar_stock(p_producto_id UUID, p_cantidad INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stock INTEGER;
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;
    UPDATE public.productos SET stock = stock + p_cantidad
     WHERE id = p_producto_id
    RETURNING stock INTO v_stock;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCTO_INEXISTENTE: %', p_producto_id;
    END IF;
    RETURN v_stock;
END $$;

REVOKE EXECUTE ON FUNCTION public.cargar_stock(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cargar_stock(UUID, INTEGER) TO authenticated;


-- ---------------------------------------------------------------------
-- 19.17 PAREJA A · A4 SUBALQUILER: SALONES Y COBRO (migración 20261111_02)
-- ---------------------------------------------------------------------

-- =====================================================================
--  A4 · Cobro de subalquiler (CU16) · Pareja A
--  Salones con precio por hora y mensual · cobro calculado por el sistema
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261111_01.
--  Es re-ejecutable.
--
--  Decisiones (11/11/2026):
--    · espacios_alquiler pasa a ser el catálogo de SALONES. Los carga y
--      edita SOLO el SuperAdmin (política espacios_write, ya existente).
--      Cada salón tiene precio por hora y, opcional, precio mensual.
--      Las promos se manejan cambiando el precio del salón.
--    · Quién alquila ya no es un dato del salón: se escribe en cada cobro
--      (los que alquilan por hora suelen ser eventuales).
--    · Cobran Recepción y SuperAdmin. El monto lo calcula la base con el
--      precio vigente (horas × precio por hora, o precio mensual):
--      la recepcionista no lo puede cambiar (opción B).
--    · Efectivo va al turno de caja; transferencia solo al dashboard.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Salones
-- ---------------------------------------------------------------------
ALTER TABLE public.espacios_alquiler ADD COLUMN IF NOT EXISTS precio_hora    NUMERIC(12,2);
ALTER TABLE public.espacios_alquiler ADD COLUMN IF NOT EXISTS precio_mensual NUMERIC(12,2);

-- Lo que había en canon_sugerido era el precio mensual
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'espacios_alquiler'
                  AND column_name = 'canon_sugerido') THEN
        UPDATE public.espacios_alquiler SET precio_mensual = coalesce(precio_mensual, canon_sugerido);
        ALTER TABLE public.espacios_alquiler DROP COLUMN canon_sugerido;
    END IF;
END $$;

ALTER TABLE public.espacios_alquiler DROP COLUMN IF EXISTS locatario;

UPDATE public.espacios_alquiler SET precio_hora = 15000 WHERE precio_hora IS NULL;
ALTER TABLE public.espacios_alquiler ALTER COLUMN precio_hora SET NOT NULL;

ALTER TABLE public.espacios_alquiler DROP CONSTRAINT IF EXISTS chk_precio_hora;
ALTER TABLE public.espacios_alquiler ADD  CONSTRAINT chk_precio_hora    CHECK (precio_hora > 0);
ALTER TABLE public.espacios_alquiler DROP CONSTRAINT IF EXISTS chk_precio_mensual;
ALTER TABLE public.espacios_alquiler ADD  CONSTRAINT chk_precio_mensual CHECK (precio_mensual IS NULL OR precio_mensual > 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_espacios_nombre ON public.espacios_alquiler (lower(nombre));

-- El salón de prueba deja de tener nombre de horario
UPDATE public.espacios_alquiler SET nombre = 'Salón funcional'
 WHERE id = 'e0000000-0000-0000-0000-000000000001' AND nombre = 'Sector funcional – sábados';


-- ---------------------------------------------------------------------
-- 2. Cobro de subalquiler (reemplaza a la versión con monto libre)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_cobro_alquiler(UUID, NUMERIC, public.medio_pago, TEXT);
DROP FUNCTION IF EXISTS public.registrar_cobro_alquiler(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, public.medio_pago);

CREATE FUNCTION public.registrar_cobro_alquiler(
    p_espacio_id UUID,
    p_modalidad  TEXT,              -- 'Por hora' | 'Mensual'
    p_horas      NUMERIC,           -- solo Por hora (múltiplos de media hora)
    p_periodo    DATE,              -- solo Mensual (cualquier día del mes que paga)
    p_locatario  TEXT,              -- quién alquila
    p_contacto   TEXT,              -- celular (opcional)
    p_medio      public.medio_pago
)
RETURNS NUMERIC                     -- monto cobrado
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_salon     public.espacios_alquiler;
    v_locatario TEXT := trim(coalesce(p_locatario, ''));
    v_contacto  TEXT := nullif(regexp_replace(coalesce(p_contacto, ''), '\D', '', 'g'), '');
    v_monto     NUMERIC;
    v_detalle   TEXT;
    v_turno     UUID;
    v_meses     TEXT[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio',
                                'agosto','septiembre','octubre','noviembre','diciembre'];
BEGIN
    PERFORM public._exigir_rol('{Recepcionista,SuperAdmin}');

    SELECT * INTO v_salon FROM public.espacios_alquiler WHERE id = p_espacio_id AND activo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ESPACIO_INEXISTENTE';
    END IF;
    IF v_locatario = '' THEN
        RAISE EXCEPTION 'LOCATARIO_REQUERIDO';
    END IF;

    IF p_modalidad = 'Por hora' THEN
        IF p_horas IS NULL OR p_horas <= 0 OR p_horas > 24 OR (p_horas * 2) <> trunc(p_horas * 2) THEN
            RAISE EXCEPTION 'HORAS_INVALIDAS: %', p_horas;
        END IF;
        v_monto   := round(p_horas * v_salon.precio_hora, 2);
        v_detalle := format('%s · Por hora · %s h × $%s', v_salon.nombre,
                            replace(rtrim(rtrim(p_horas::text, '0'), '.'), '.', ','),
                            replace(to_char(v_salon.precio_hora, 'FM999,999,990'), ',', '.'));
    ELSIF p_modalidad = 'Mensual' THEN
        IF v_salon.precio_mensual IS NULL THEN
            RAISE EXCEPTION 'SIN_PRECIO_MENSUAL';
        END IF;
        IF p_periodo IS NULL THEN
            RAISE EXCEPTION 'PERIODO_REQUERIDO';
        END IF;
        v_monto   := v_salon.precio_mensual;
        v_detalle := format('%s · Mensual · %s %s', v_salon.nombre,
                            v_meses[extract(month FROM p_periodo)::int], extract(year FROM p_periodo)::int);
    ELSE
        RAISE EXCEPTION 'MODALIDAD_INVALIDA: %', p_modalidad;
    END IF;

    v_detalle := v_detalle || ' · ' || v_locatario || coalesce(' · ' || v_contacto, '');

    IF p_medio = 'Efectivo' THEN
        v_turno := public._turno_abierto();
    END IF;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, espacio_id, turno_id, registrado_por, detalle)
    VALUES ('Subalquiler', p_medio, v_monto, p_espacio_id, v_turno, auth.uid(), v_detalle);

    RETURN v_monto;
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_cobro_alquiler(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, public.medio_pago) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_cobro_alquiler(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, public.medio_pago) TO authenticated;


-- ---------------------------------------------------------------------
-- 19.18 PAREJA A · A5 CAJA DE RECEPCIÓN Y COBROS DEL DUEÑO (migración 20261111_03)
-- ---------------------------------------------------------------------

-- =====================================================================
--  A5 · Caja de recepción y cobros del dueño · Pareja A
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261111_02.
--  Es re-ejecutable.
--
--  Decisión del equipo (11/11/2026):
--    · La CAJA (turno, kiosco, arqueo) es solo de las RECEPCIONISTAS.
--    · El DUEÑO no abre turno, pero a veces le pagan directo a él:
--      puede anotar cobros de CUOTA (efectivo o transferencia) y de
--      SUBALQUILER (efectivo o transferencia). Ese efectivo queda
--      registrado SIN turno: no altera el cierre de ninguna recepcionista.
--    · KIOSCO: solo recepcionistas (siempre dentro de un turno).
--    · Cuota por transferencia anotada a mano: solo el dueño. Las de los
--      alumnos siguen por el flujo de comprobantes (B4/B5).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Efectivo sin turno permitido (cobros del dueño)
--    Antes: efectivo ⇔ turno. Ahora: la transferencia nunca tiene turno;
--    el efectivo puede no tenerlo. Las funciones controlan quién.
-- ---------------------------------------------------------------------
ALTER TABLE public.ingresos DROP CONSTRAINT IF EXISTS chk_caja;
ALTER TABLE public.ingresos ADD  CONSTRAINT chk_caja CHECK (medio_pago = 'Efectivo' OR turno_id IS NULL);


-- ---------------------------------------------------------------------
-- 2. Turno de la recepcionista. El dueño no tiene caja: devuelve NULL.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._turno_abierto() RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
    IF public.mi_rol() = 'SuperAdmin' THEN
        RETURN NULL;   -- cobro del dueño, fuera de la caja
    END IF;
    SELECT id INTO v_id FROM public.turnos_caja
     WHERE usuario_id = auth.uid() AND cerrado_at IS NULL;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'SIN_TURNO_ABIERTO: abrí un turno de caja para cobrar en efectivo';
    END IF;
    RETURN v_id;
END $$;


-- ---------------------------------------------------------------------
-- 3. Abrir, cerrar y justificar el turno: solo recepcionistas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abrir_turno(p_monto_inicial NUMERIC DEFAULT 0)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista}');
    IF EXISTS (SELECT 1 FROM public.turnos_caja WHERE usuario_id = auth.uid() AND cerrado_at IS NULL) THEN
        RAISE EXCEPTION 'TURNO_YA_ABIERTO';
    END IF;
    INSERT INTO public.turnos_caja (usuario_id, monto_inicial)
    VALUES (auth.uid(), coalesce(p_monto_inicial, 0))
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cerrar_turno(p_monto_contado NUMERIC, p_comentario TEXT DEFAULT NULL)
RETURNS TABLE (turno_id UUID, monto_inicial NUMERIC, efectivo_cobrado NUMERIC,
               monto_esperado NUMERIC, monto_contado NUMERIC, diferencia NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_turno   public.turnos_caja;
    v_cobrado NUMERIC;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista}');
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

CREATE OR REPLACE FUNCTION public.justificar_cierre(p_turno_id UUID, p_comentario TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{Recepcionista}');
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
-- 4. Kiosco: solo recepcionistas (misma lógica que antes)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_venta(p_items JSONB, p_medio public.medio_pago)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_turno UUID;
    v_venta UUID;
    v_total NUMERIC := 0;
    v_prod  public.productos;
    it      RECORD;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista}');
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


-- ---------------------------------------------------------------------
-- 5. Cobro de cuota con medio de pago
--    Efectivo: recepcionista (con turno) o dueño (sin turno).
--    Transferencia anotada a mano: solo el dueño.
--    registrar_pago_efectivo queda como atajo (la usa la pantalla de A2).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_pago_cuota(p_alumno_id UUID, p_medio public.medio_pago)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rol    public.rol_usuario;
    v_turno  UUID;
    v_precio NUMERIC;
BEGIN
    v_rol := public._exigir_rol('{Recepcionista,SuperAdmin}');
    IF p_medio = 'Transferencia' AND v_rol <> 'SuperAdmin' THEN
        RAISE EXCEPTION 'PERMISO_DENEGADO: las transferencias de cuota las registra el dueño o entran por comprobante'
              USING ERRCODE = '42501';
    END IF;
    IF p_medio = 'Efectivo' THEN
        v_turno := public._turno_abierto();
    END IF;

    SELECT p.precio INTO v_precio
      FROM public.alumnos a JOIN public.planes p ON p.id = a.plan_id
     WHERE a.usuario_id = p_alumno_id;
    IF v_precio IS NULL THEN
        RAISE EXCEPTION 'SIN_PLAN: el alumno no tiene un plan asignado';
    END IF;

    INSERT INTO public.ingresos (concepto, medio_pago, monto, alumno_id, turno_id, registrado_por, detalle)
    VALUES ('Cuota', p_medio, v_precio, p_alumno_id, v_turno, auth.uid(),
            'Cuota - ' || p_medio || CASE WHEN v_rol = 'SuperAdmin' THEN ' (cobrada por el dueño)' ELSE '' END);

    RETURN public._extender_membresia(p_alumno_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_cuota(UUID, public.medio_pago) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_pago_cuota(UUID, public.medio_pago) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_pago_efectivo(p_alumno_id UUID)
RETURNS date
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT public.registrar_pago_cuota(p_alumno_id, 'Efectivo')
$$;


-- ---------------------------------------------------------------------
-- 6. Turnos que el dueño haya abierto en las pruebas: se cierran sin arqueo
-- ---------------------------------------------------------------------
UPDATE public.turnos_caja t
   SET cerrado_at = now(), monto_contado = t.monto_inicial, monto_esperado = t.monto_inicial,
       comentario = 'Cerrado por migración: el dueño no usa caja'
 WHERE t.cerrado_at IS NULL
   AND t.usuario_id IN (SELECT id FROM public.usuarios WHERE rol = 'SuperAdmin');


-- ---------------------------------------------------------------------
-- 19.19 PAREJA A · A5 CIERRE OPCIÓN B Y AVISO AL DUEÑO (migración 20261112_02)
-- ---------------------------------------------------------------------

-- =====================================================================
--  A5 · Cierre de turno: qué ve la recepcionista y aviso al dueño
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261111_03.
--  Es re-ejecutable.
--
--  Decisión del equipo (12/11/2026) · opción B:
--    · Al cerrar, la recepcionista ve SOLO si la caja cierra justo, sobra
--      o falta, y cuánto. No ve el efectivo cobrado ni el esperado.
--      (La función ya no los devuelve.)
--    · Los cierres con diferencia le aparecen al DUEÑO como aviso dentro
--      de la app (pantalla Ingresos) hasta que los marca como revisados.
--      El aviso por mail queda como mejora futura.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Revisión del dueño
-- ---------------------------------------------------------------------
ALTER TABLE public.turnos_caja ADD COLUMN IF NOT EXISTS revisado_at  TIMESTAMPTZ;
ALTER TABLE public.turnos_caja ADD COLUMN IF NOT EXISTS revisado_por UUID REFERENCES public.usuarios(id);


-- ---------------------------------------------------------------------
-- 2. cerrar_turno devuelve solo la diferencia (cambia lo que devuelve)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cerrar_turno(NUMERIC, TEXT);

CREATE FUNCTION public.cerrar_turno(p_monto_contado NUMERIC, p_comentario TEXT DEFAULT NULL)
RETURNS TABLE (turno_id UUID, diferencia NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_turno   public.turnos_caja;
    v_cobrado NUMERIC;
BEGIN
    PERFORM public._exigir_rol('{Recepcionista}');
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
    SELECT v_turno.id, p_monto_contado - (v_turno.monto_inicial + v_cobrado);
END $$;

REVOKE EXECUTE ON FUNCTION public.cerrar_turno(NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cerrar_turno(NUMERIC, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 3. Cierres para el dueño (con todos los montos) y marca de revisado
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cierres_caja WITH (security_invoker = true) AS
SELECT t.id, t.usuario_id, u.nombre || ' ' || u.apellido AS recepcionista,
       t.abierto_at, t.cerrado_at, t.monto_inicial,
       t.monto_esperado - t.monto_inicial AS efectivo_cobrado,
       t.monto_esperado, t.monto_contado, t.diferencia, t.comentario,
       t.revisado_at, t.revisado_por
  FROM public.turnos_caja t
  JOIN public.usuarios u ON u.id = t.usuario_id
 WHERE t.cerrado_at IS NOT NULL
   AND public.mi_rol() = 'SuperAdmin';
GRANT SELECT ON public.v_cierres_caja TO authenticated;

CREATE OR REPLACE FUNCTION public.marcar_cierre_revisado(p_turno_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    UPDATE public.turnos_caja
       SET revisado_at = now(), revisado_por = auth.uid()
     WHERE id = p_turno_id AND cerrado_at IS NOT NULL AND revisado_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CIERRE_YA_REVISADO';
    END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.marcar_cierre_revisado(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.marcar_cierre_revisado(UUID) TO authenticated;

-- Los cierres sin diferencia no necesitan revisión
UPDATE public.turnos_caja SET revisado_at = cerrado_at
 WHERE cerrado_at IS NOT NULL AND diferencia = 0 AND revisado_at IS NULL;


-- ---------------------------------------------------------------------
-- 19.20 PAREJA A · A6 PERSONAL Y PASE LIBRE (migración 20261112_01)
-- ---------------------------------------------------------------------

-- =====================================================================
--  A6 · Personal y Pase Libre (CU15, RF12, RNF05) · Pareja A
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261112_02.
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
-- 19.21 PAREJA A · A7 DASHBOARD DE INGRESOS (migración 20261112_03)
-- ---------------------------------------------------------------------

-- =====================================================================
--  A7 · Dashboard de ingresos (CU12, RF07, RF14, RNF01) · Pareja A
--
--  Correr en el SQL Editor de Supabase DESPUÉS de 20261112_01.
--  Es re-ejecutable.
--
--    · v_movimientos: cada ingreso con fecha local, quién lo cobró y a
--      quién (solo SuperAdmin; el resto de los roles no ve filas).
--    · configuracion_admin: una sola fila con el link a la planilla de
--      Google Sheets de la administración (RF14). Solo el dueño la ve y
--      la cambia (RNF05).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Movimientos (detalle de ingresos para el dashboard y el CSV)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_movimientos WITH (security_invoker = true) AS
SELECT i.id,
       (i.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
       i.created_at,
       i.concepto,
       i.medio_pago,
       i.monto,
       i.detalle,
       r.nombre || ' ' || r.apellido                                   AS cobrado_por,
       r.rol                                                           AS rol_cobro,
       a.nombre || ' ' || a.apellido                                   AS alumno,
       i.turno_id IS NULL AND i.medio_pago = 'Efectivo'                AS fuera_de_caja
  FROM public.ingresos i
  JOIN public.usuarios r      ON r.id = i.registrado_por
  LEFT JOIN public.usuarios a ON a.id = i.alumno_id
 WHERE public.mi_rol() = 'SuperAdmin';
GRANT SELECT ON public.v_movimientos TO authenticated;


-- ---------------------------------------------------------------------
-- 2. Link a la planilla de Google Sheets (RF14)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configuracion_admin (
    id            BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),   -- una sola fila
    planilla_url  TEXT CHECK (planilla_url IS NULL OR planilla_url ~ '^https://'),
    actualizado_at  TIMESTAMPTZ,
    actualizado_por UUID REFERENCES public.usuarios(id)
);
INSERT INTO public.configuracion_admin (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracion_admin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS configuracion_admin_select ON public.configuracion_admin;
CREATE POLICY configuracion_admin_select ON public.configuracion_admin FOR SELECT TO authenticated
    USING (public.mi_rol() = 'SuperAdmin');
REVOKE INSERT, UPDATE, DELETE ON public.configuracion_admin FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guardar_planilla_url(p_url TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url TEXT := nullif(trim(coalesce(p_url, '')), '');
BEGIN
    PERFORM public._exigir_rol('{SuperAdmin}');
    IF v_url IS NOT NULL AND v_url !~ '^https://' THEN
        RAISE EXCEPTION 'URL_INVALIDA';
    END IF;
    UPDATE public.configuracion_admin
       SET planilla_url = v_url, actualizado_at = now(), actualizado_por = auth.uid()
     WHERE id;
END $$;
REVOKE EXECUTE ON FUNCTION public.guardar_planilla_url(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.guardar_planilla_url(TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 20. VERIFICACIÓN RÁPIDA (el SQL Editor corre como admin y ve todo)
-- ---------------------------------------------------------------------
SELECT nombre, apellido, estado_alumno, plan, dias_restantes, estado_membresia, estado_certificado
  FROM public.v_membresias ORDER BY estado_alumno, dias_restantes;
