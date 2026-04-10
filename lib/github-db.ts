// GitHub Issues API para persistencia de datos en GitHub Pages
// Usa issues como base de datos NoSQL simple

const GITHUB_API_BASE = "https://api.github.com";

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  labels: Array<{ name: string }>;
}

interface GitHubDBConfig {
  owner: string;
  repo: string;
  token: string;
}

let config: GitHubDBConfig | null = null;

// Inicializar configuración desde variables de entorno
export function initGitHubDB(): void {
  if (typeof window !== "undefined") {
    // En el cliente, leer desde window.env (inyectado por Next.js)
    config = {
      owner: (window as any).NEXT_PUBLIC_GITHUB_OWNER || "",
      repo: (window as any).NEXT_PUBLIC_GITHUB_REPO || "",
      token: (window as any).NEXT_PUBLIC_GITHUB_TOKEN || "",
    };
  } else {
    // En el servidor (build time)
    config = {
      owner: process.env.NEXT_PUBLIC_GITHUB_OWNER || "",
      repo: process.env.NEXT_PUBLIC_GITHUB_REPO || "",
      token: process.env.NEXT_PUBLIC_GITHUB_TOKEN || "",
    };
  }

  if (!config.owner || !config.repo || !config.token) {
    console.warn("GitHub DB no configurado. Usando localStorage como fallback.");
    config = null;
  }
}

// Obtener headers para autenticación
function getHeaders(): HeadersInit {
  if (!config) {
    throw new Error("GitHub DB no está configurado");
  }
  return {
    Authorization: `token ${config.token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };
}

// Crear o actualizar un issue (registro)
async function upsertIssue(
  key: string,
  data: any,
  label: string = "database"
): Promise<void> {
  if (!config) return;

  try {
    // Buscar si ya existe un issue con este key
    const issues = await fetch(
      `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues?labels=${label}&state=all&per_page=100`,
      { headers: getHeaders() }
    ).then((res) => res.json());

    const existingIssue = issues.find((issue: GitHubIssue) => issue.title === key);

    const body = JSON.stringify(data, null, 2);

    if (existingIssue) {
      // Actualizar issue existente
      await fetch(
        `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues/${existingIssue.number}`,
        {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify({ body }),
        }
      );
    } else {
      // Crear nuevo issue
      await fetch(`${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          title: key,
          body,
          labels: [label],
        }),
      });
    }
  } catch (error) {
    console.error("Error al guardar en GitHub:", error);
    throw error;
  }
}

// Obtener un issue por key
async function getIssue(key: string, label: string = "database"): Promise<any | null> {
  if (!config) return null;

  try {
    const issues = await fetch(
      `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues?labels=${label}&state=all&per_page=100`,
      { headers: getHeaders() }
    ).then((res) => res.json());

    const issue = issues.find((i: GitHubIssue) => i.title === key);

    if (!issue || !issue.body) return null;

    return JSON.parse(issue.body);
  } catch (error) {
    console.error("Error al leer de GitHub:", error);
    return null;
  }
}

// Obtener todos los issues con un label específico
async function getAllIssues(label: string = "database"): Promise<Record<string, any>> {
  if (!config) return {};

  try {
    const issues = await fetch(
      `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues?labels=${label}&state=all&per_page=100`,
      { headers: getHeaders() }
    ).then((res) => res.json());

    const result: Record<string, any> = {};
    for (const issue of issues) {
      if (issue.body) {
        try {
          result[issue.title] = JSON.parse(issue.body);
        } catch {
          // Ignorar issues con JSON inválido
        }
      }
    }

    return result;
  } catch (error) {
    console.error("Error al leer todos los datos de GitHub:", error);
    return {};
  }
}

// Eliminar un issue por key
async function deleteIssue(key: string, label: string = "database"): Promise<boolean> {
  if (!config) return false;

  try {
    const issues = await fetch(
      `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues?labels=${label}&state=all&per_page=100`,
      { headers: getHeaders() }
    ).then((res) => res.json());

    const issue = issues.find((i: GitHubIssue) => i.title === key);

    if (!issue) return false;

    // Cerrar el issue en lugar de eliminarlo (GitHub no permite eliminar issues via API)
    await fetch(
      `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/issues/${issue.number}`,
      {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ state: "closed" }),
      }
    );

    return true;
  } catch (error) {
    console.error("Error al eliminar de GitHub:", error);
    return false;
  }
}

// Verificar si GitHub DB está configurado
export function isGitHubDBConfigured(): boolean {
  return config !== null;
}

// Exportar funciones públicas
export const githubDB = {
  init: initGitHubDB,
  isConfigured: isGitHubDBConfigured,
  set: upsertIssue,
  get: getIssue,
  getAll: getAllIssues,
  delete: deleteIssue,
};
