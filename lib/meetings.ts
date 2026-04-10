import { githubDB } from "./github-db";

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

// Inicializar GitHub DB
githubDB.init();

// Obtener reuniones del GitHub DB o localStorage (fallback)
async function getStoredMeetings(): Promise<Meeting[]> {
  // Intentar usar GitHub DB primero
  if (githubDB.isConfigured()) {
    try {
      const data = await githubDB.get(MEETINGS_STORAGE_KEY, "meetings");
      if (data && Array.isArray(data)) {
        // Sincronizar con localStorage como backup
        if (typeof window !== "undefined") {
          localStorage.setItem(MEETINGS_STORAGE_KEY, JSON.stringify(data));
        }
        return data;
      }
    } catch (error) {
      console.warn("GitHub DB error, using localStorage fallback:", error);
    }
  }

  // Fallback a localStorage
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

// Guardar reuniones en GitHub DB y localStorage
async function saveMeetings(meetings: Meeting[]): Promise<void> {
  // Guardar en GitHub DB si está configurado
  if (githubDB.isConfigured()) {
    try {
      await githubDB.set(MEETINGS_STORAGE_KEY, meetings, "meetings");
    } catch (error) {
      console.warn("Error saving to GitHub DB:", error);
    }
  }

  // Siempre guardar en localStorage como backup
  if (typeof window !== "undefined") {
    localStorage.setItem(MEETINGS_STORAGE_KEY, JSON.stringify(meetings));
  }
}

// Generar ID único
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CRUD Operations
export async function getUpcomingMeetings(): Promise<Meeting[]> {
  const meetings = await getStoredMeetings();
  const now = new Date();
  
  return meetings
    .filter((meeting: Meeting) => new Date(meeting.date) > now)
    .sort((a: Meeting, b: Meeting) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getAllMeetings(): Promise<Meeting[]> {
  const meetings = await getStoredMeetings();
  return meetings.sort((a: Meeting, b: Meeting) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getMeetingById(id: string): Promise<Meeting | undefined> {
  const meetings = await getStoredMeetings();
  return meetings.find((m: Meeting) => m.id === id);
}

export async function createMeeting(meeting: Omit<Meeting, "id">): Promise<Meeting> {
  const meetings = await getStoredMeetings();
  const newMeeting: Meeting = {
    ...meeting,
    id: generateId(),
  };
  meetings.push(newMeeting);
  await saveMeetings(meetings);
  return newMeeting;
}

export async function updateMeeting(id: string, updates: Partial<Omit<Meeting, "id">>): Promise<Meeting | null> {
  const meetings = await getStoredMeetings();
  const index = meetings.findIndex((m: Meeting) => m.id === id);
  
  if (index === -1) return null;
  
  meetings[index] = { ...meetings[index], ...updates };
  await saveMeetings(meetings);
  return meetings[index];
}

export async function deleteMeeting(id: string): Promise<boolean> {
  const meetings = await getStoredMeetings();
  const filtered = meetings.filter((m: Meeting) => m.id !== id);
  
  if (filtered.length === meetings.length) return false;
  
  await saveMeetings(filtered);
  return true;
}

// Importar múltiples reuniones (para CSV/Excel)
export async function importMeetings(newMeetings: Omit<Meeting, "id">[]): Promise<Meeting[]> {
  const meetings = await getStoredMeetings();
  const created: Meeting[] = [];
  
  for (const meeting of newMeetings) {
    const newMeeting: Meeting = {
      ...meeting,
      id: generateId(),
    };
    meetings.push(newMeeting);
    created.push(newMeeting);
  }
  
  await saveMeetings(meetings);
  return created;
}

// Limpiar reuniones pasadas
export async function cleanPastMeetings(): Promise<number> {
  const meetings = await getStoredMeetings();
  const now = new Date();
  const upcoming = meetings.filter((m: Meeting) => new Date(m.date) > now);
  const removed = meetings.length - upcoming.length;
  
  if (removed > 0) {
    await saveMeetings(upcoming);
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
