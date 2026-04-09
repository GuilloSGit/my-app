export interface Meeting {
  id: string;
  date: string; // ISO date string
  title: string;
  zoomLink: string;
  zoomId: string;
  passcode: string;
}

// Datos de ejemplo - En producción, estos vendrían de una API o base de datos
const meetingsData: Meeting[] = [
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

export function getUpcomingMeetings(): Meeting[] {
  const now = new Date();
  
  return meetingsData
    .filter(meeting => new Date(meeting.date) > now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function getMeetingById(id: string): Meeting | undefined {
  return meetingsData.find(m => m.id === id);
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
