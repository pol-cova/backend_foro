import { getScoreboard } from "./service";

interface Listener {
  controller: ReadableStreamDefaultController;
  nivel?: string;
}

const listeners = new Map<string, Set<Listener>>();

export function addScoreboardListener(concursoId: string, controller: ReadableStreamDefaultController, nivel?: string) {
  if (!listeners.has(concursoId)) {
    listeners.set(concursoId, new Set());
  }
  listeners.get(concursoId)!.add({ controller, nivel });
}

export function removeScoreboardListener(concursoId: string, controller: ReadableStreamDefaultController) {
  const set = listeners.get(concursoId);
  if (!set) return;

  for (const listener of set) {
    if (listener.controller === controller) {
      set.delete(listener);
      break;
    }
  }

  if (set.size === 0) {
    listeners.delete(concursoId);
  }
}

function sendEvent(controller: ReadableStreamDefaultController, data: unknown) {
  try {
    const payload = JSON.stringify(data);
    controller.enqueue(new TextEncoder().encode(`event: message\ndata: ${payload}\n\n`));
  } catch {
    // Controller is closed — ignore
  }
}

export async function broadcastScoreboardUpdate(concursoId: string) {
  const set = listeners.get(concursoId);
  if (!set || set.size === 0) return;

  // Compute scoreboard once per unique nivel filter
  const scoreboards = new Map<string | undefined, unknown>();

  for (const listener of set) {
    let scoreboard = scoreboards.get(listener.nivel);
    if (scoreboard === undefined) {
      const result = await getScoreboard(concursoId, listener.nivel);
      if (result.success) {
        scoreboard = result.results;
        scoreboards.set(listener.nivel, scoreboard);
      } else {
        scoreboards.set(listener.nivel, null);
        continue;
      }
    }

    if (scoreboard !== null) {
      sendEvent(listener.controller, scoreboard);
    }
  }
}
