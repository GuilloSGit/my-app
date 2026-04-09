export interface Meeting {
  id: string;
  date: string; // ISO date string
  title: string;
  zoomLink: string;
  zoomId: string;
  passcode: string;
}

const MEETINGS_STORAGE_KEY = "media-agua-meetings";

// Datos iniciales de ejemplo
const defaultMeetings: Meeting[] = [
  {
    id: "1",
    date: "2026-04-12T19:00:00",
    title: "Reunión General",
    zoomLink: "https://zoom.us/j/example123",
    zoomId: "123 456 7890",
    passcode: "mediaagua",
  },
  {
    id: "2",
    date: "2026-04-19T19:00:00",
    title: "Estudio Bíblico",
    zoomLink: "https://zoom.us/j/example456",
    zoomId: "987 654 3210",
    passcode: "congregacion",
  },
];

// Obtener reuniones del localStorage o usar defaults
function getStoredMeetings(): Meeting[] {
  if (typeof window === "undefined") return defaultMeetings;
  
  const stored = localStorage.getItem(MEETINGS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return defaultMeetings;
    }
  }
  // Inicializar con defaults si no hay nada guardado
  localStorage.setItem(MEETINGS_STORAGE_KEY, JSON.stringify(defaultMeetings));
  return defaultMeetings;
}

// Guardar reuniones en localStorage
function saveMeetings(meetings: Meeting[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MEETINGS_STORAGE_KEY, JSON.stringify(meetings));
}

// Generar ID único
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CRUD Operations
export function getUpcomingMeetings(): Meeting[] {
  const meetings = getStoredMeetings();
  const now = new Date();
  
  return meetings
    .filter(meeting => new Date(meeting.date) > now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function getAllMeetings(): Meeting[] {
  const meetings = getStoredMeetings();
  return meetings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function getMeetingById(id: string): Meeting | undefined {
  const meetings = getStoredMeetings();
  return meetings.find(m => m.id === id);
}

export function createMeeting(meeting: Omit<Meeting, "id">): Meeting {
  const meetings = getStoredMeetings();
  const newMeeting: Meeting = {
    ...meeting,
    id: generateId(),
  };
  meetings.push(newMeeting);
  saveMeetings(meetings);
  return newMeeting;
}

export function updateMeeting(id: string, updates: Partial<Omit<Meeting, "id">>): Meeting | null {
  const meetings = getStoredMeetings();
  const index = meetings.findIndex(m => m.id === id);
  
  if (index === -1) return null;
  
  meetings[index] = { ...meetings[index], ...updates };
  saveMeetings(meetings);
  return meetings[index];
}

export function deleteMeeting(id: string): boolean {
  const meetings = getStoredMeetings();
  const filtered = meetings.filter(m => m.id !== id);
  
  if (filtered.length === meetings.length) return false;
  
  saveMeetings(filtered);
  return true;
}

// Importar múltiples reuniones (para CSV/Excel)
export function importMeetings(newMeetings: Omit<Meeting, "id">[]): Meeting[] {
  const meetings = getStoredMeetings();
  const created: Meeting[] = [];
  
  for (const meeting of newMeetings) {
    const newMeeting: Meeting = {
      ...meeting,
      id: generateId(),
    };
    meetings.push(newMeeting);
    created.push(newMeeting);
  }
  
  saveMeetings(meetings);
  return created;
}

// Limpiar reuniones pasadas
export function cleanPastMeetings(): number {
  const meetings = getStoredMeetings();
  const now = new Date();
  const upcoming = meetings.filter(m => new Date(m.date) > now);
  const removed = meetings.length - upcoming.length;
  
  if (removed > 0) {
    saveMeetings(upcoming);
  }
  
  return removed;
}

export function formatMeetingDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMeetingTime(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Validar datos de reunión
export function validateMeeting(meeting: Partial<Meeting>): string | null {
  if (!meeting.date) return "La fecha es requerida";
  if (!meeting.title?.trim()) return "El título es requerido";
  if (!meeting.zoomLink?.trim()) return "El link de Zoom es requerido";
  if (!meeting.zoomId?.trim()) return "El ID de reunión es requerido";
  if (!meeting.passcode?.trim()) return "La contraseña es requerida";
  
  const date = new Date(meeting.date);
  if (isNaN(date.getTime())) return "Fecha inválida";
  
  return null;
}
