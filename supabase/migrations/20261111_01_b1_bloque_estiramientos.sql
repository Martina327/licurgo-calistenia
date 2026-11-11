-- =====================================================================
--  B1 · Iteración 3 — bloque Estiramientos
--  Correr en el SQL Editor de Supabase, SOLA (antes que la 20261111_02):
--  Postgres no deja usar un valor nuevo de un enum en la misma
--  transacción en la que se agrega. (Ya incluido en schema.sql.)
--
--  Queda al final del día, después de Accesorios: el orden del enum es
--  el orden en que se muestran los bloques.
-- =====================================================================

ALTER TYPE public.bloque_ejercicio ADD VALUE IF NOT EXISTS 'Estiramientos' AFTER 'Accesorios';
