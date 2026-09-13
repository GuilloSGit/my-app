-- Corrección pedida por el usuario justo después de la migración anterior:
-- usar America/Argentina/Buenos_Aires en vez de San_Juan. Mismo offset
-- real (GMT-3, sin DST en ninguna de las dos) — no mueve ningún horario,
-- solo cambia el identificador IANA guardado.
update meeting_schedules
set timezone = 'America/Argentina/Buenos_Aires'
where timezone = 'America/Argentina/San_Juan';
