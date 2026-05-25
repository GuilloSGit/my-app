import { supabase } from "./supabase";

export interface Meeting {
  id: string;
  date: string; // ISO date string
  title: string;
  zoomLink: string;
  zoomId: string;
  passcode: string;
}

interface MeetingRow {
  id: string;
  title: string;
  date: string;
  zoom_link: string;
  zoom_id: string;
  passcode: string;
}

function rowToMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    zoomLink: row.zoom_link,
    zoomId: row.zoom_id,
    passcode: row.passcode,
  };
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export async function getUpcomingMeetings(): Promise<Meeting[]> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .gte("date", cutoff)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as MeetingRow[]).map(rowToMeeting);
}

export async function getAllMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as MeetingRow[]).map(rowToMeeting);
}

export async function getMeetingById(id: string): Promise<Meeting | undefined> {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return undefined;
  return rowToMeeting(data as MeetingRow);
}

export async function createMeeting(meeting: Omit<Meeting, "id">): Promise<Meeting> {
  const row = {
    id: generateId(),
    title: meeting.title,
    date: meeting.date,
    zoom_link: meeting.zoomLink,
    zoom_id: meeting.zoomId,
    passcode: meeting.passcode,
  };

  const { data, error } = await supabase
    .from("meetings")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToMeeting(data as MeetingRow);
}

export async function updateMeeting(
  id: string,
  updates: Partial<Omit<Meeting, "id">>
): Promise<Meeting | null> {
  const row: Partial<MeetingRow> = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.date !== undefined) row.date = updates.date;
  if (updates.zoomLink !== undefined) row.zoom_link = updates.zoomLink;
  if (updates.zoomId !== undefined) row.zoom_id = updates.zoomId;
  if (updates.passcode !== undefined) row.passcode = updates.passcode;

  const { data, error } = await supabase
    .from("meetings")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) return null;
  return rowToMeeting(data as MeetingRow);
}

export async function deleteMeeting(id: string): Promise<boolean> {
  const { error } = await supabase.from("meetings").delete().eq("id", id);
  return !error;
}

export async function importMeetings(
  newMeetings: Omit<Meeting, "id">[]
): Promise<Meeting[]> {
  const rows = newMeetings.map((m) => ({
    id: generateId(),
    title: m.title,
    date: m.date,
    zoom_link: m.zoomLink,
    zoom_id: m.zoomId,
    passcode: m.passcode,
  }));

  const { data, error } = await supabase
    .from("meetings")
    .insert(rows)
    .select();

  if (error) throw new Error(error.message);
  return (data as MeetingRow[]).map(rowToMeeting);
}

export async function cleanPastMeetings(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("meetings")
    .delete()
    .lt("date", cutoff)
    .select();

  if (error) return 0;
  return data?.length ?? 0;
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
