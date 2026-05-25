export interface ParsedZoomMeeting {
  title: string;
  date: string;
  zoomLink: string;
  zoomId: string;
  passcode: string;
}

export function parseZoomMessage(text: string): Partial<ParsedZoomMeeting> | null {
  const result: Partial<ParsedZoomMeeting> = {};
  
  // Extraer Tema/Reunión
  const temaMatch = text.match(/Tema:\s*(.+)/i);
  if (temaMatch) {
    result.title = temaMatch[1].trim();
  }
  
  // Extraer fecha y hora - formato: "11 abr 2026 06:00 p. m."
  const horaMatch = text.match(/Hora:\s*(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i);
  if (horaMatch) {
    const day = parseInt(horaMatch[1]);
    const monthStr = horaMatch[2].toLowerCase();
    const year = parseInt(horaMatch[3]);
    let hour = parseInt(horaMatch[4]);
    const minute = parseInt(horaMatch[5]);
    const ampm = horaMatch[6].toLowerCase().replace(/\./g, "").replace(/\s/g, "");

    // Convertir mes español a número
    const meses: Record<string, number> = {
      "ene": 0, "feb": 1, "mar": 2, "abr": 3, "may": 4, "jun": 5,
      "jul": 6, "ago": 7, "sep": 8, "oct": 9, "nov": 10, "dic": 11,
      "enero": 0, "febrero": 1, "marzo": 2, "abril": 3, "mayo": 4, "junio": 5,
      "julio": 6, "agosto": 7, "septiembre": 8, "octubre": 9, "noviembre": 10, "diciembre": 11
    };

    const month = meses[monthStr] ?? 0;

    // Convertir a 24h
    if (ampm === "pm" && hour !== 12) {
      hour += 12;
    } else if (ampm === "am" && hour === 12) {
      hour = 0;
    }

    // Crear fecha usando zona horaria de Buenos Aires (UTC-3)
    // Usamos formato ISO con zona horaria explícita
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`;
    const dateObj = new Date(dateStr);
    // Guardar el string ISO con offset directamente (sin toISOString que convierte a UTC)
    result.date = dateStr;
  }
  
  // Extraer link de Zoom - buscar URL que contenga zoom.us y capturar el ID
  const linkMatch = text.match(/(https:\/\/[^\s\n]*zoom\.us\/j\/(\d+))/i);
  if (linkMatch) {
    result.zoomLink = linkMatch[1];
    // Usar el ID del link como fallback si no se extrae del texto
    result.zoomId = linkMatch[2];
  }

  // Extraer ID de reunión - formato: "ID de reunión: 893 4991 0935" o "ID de reunión: 89349910935"
  const idMatch = text.match(/ID de reun[ióo]n[:\s]+([\d\s]+)/i);
  if (idMatch) {
    // Eliminar todos los espacios del ID
    result.zoomId = idMatch[1].replace(/\s/g, "");
  }
  
  // Extraer Código de acceso/Contraseña - formato: "Código de acceso: 001914" o "Contraseña: mediaagua"
  const passMatch = text.match(/(?:C[oó]digo de acceso|Contraseña|C[oó]digo|Passcode)[:\s]+(\w+)/i);
  if (passMatch) {
    result.passcode = passMatch[1].trim();
  }
  
  // Verificar si se extrajo algo válido (al menos título y link)
  if (!result.title && !result.zoomLink) {
    return null;
  }
  
  return result;
}

export function isValidZoomMessage(text: string): boolean {
  return text.includes("zoom.us") || 
         text.includes("ID de reunión") || 
         text.includes("Código de acceso") ||
         text.includes("zoom");
}
