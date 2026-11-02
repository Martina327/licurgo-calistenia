-- =====================================================================
--  Seguridad: permisos de funciones (advertencias del Security Advisor)
--  Correr DESPUÉS de las migraciones 01, 02 (B1) y 03. Es re-ejecutable.
--  (Ya incluido en supabase/schema.sql, sección 17.)
--
--  1. Funciones de trigger: nadie las llama por la API (/rest/v1/rpc/...).
--     Los triggers se siguen disparando igual: PostgreSQL no pide permiso
--     de EXECUTE para ejecutar la función de un trigger.
--  2. mi_rol() y es_staff(): las usan las políticas RLS, así que el rol
--     authenticated las necesita. Un usuario sin login (anon) no.
--  3. hoy_ar(): search_path fijo, para que nadie pueda cambiar qué
--     función now() se usa.
--
--  Las demás funciones SECURITY DEFINER (registrar_checkin, guardar_rutina,
--  aprobar_comprobante, etc.) SÍ deben poder llamarse logueado: son la API
--  del sistema y validan el rol adentro con _exigir_rol().
-- =====================================================================

-- 1. Funciones de trigger: fuera de la API
REVOKE EXECUTE ON FUNCTION public.fn_tocar_rutina(),
                           public.fn_validar_roles_coach_alumno(),
                           public.fn_nuevo_usuario_auth()
    FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    -- Trigger del catálogo de ejercicios (migración 01 de la Pareja B)
    IF to_regprocedure('public.fn_validar_progresion()') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.fn_validar_progresion() FROM PUBLIC, anon, authenticated;
    END IF;
END $$;

-- 2. Helpers de RLS: solo usuarios logueados
REVOKE EXECUTE ON FUNCTION public.mi_rol(), public.es_staff() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mi_rol(), public.es_staff() TO authenticated, service_role;

-- 3. search_path fijo (now() está en pg_catalog, que siempre se busca)
ALTER FUNCTION public.hoy_ar() SET search_path = '';
