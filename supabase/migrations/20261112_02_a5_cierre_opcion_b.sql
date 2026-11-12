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


-- Verificación: cierres con diferencia pendientes de revisar
SELECT recepcionista, cerrado_at, diferencia, comentario
  FROM public.turnos_caja t JOIN public.usuarios u ON u.id = t.usuario_id
  CROSS JOIN LATERAL (SELECT u.nombre || ' ' || u.apellido AS recepcionista) r
 WHERE t.cerrado_at IS NOT NULL AND t.diferencia <> 0 AND t.revisado_at IS NULL;
