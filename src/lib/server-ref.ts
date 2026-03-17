type ServerLike = { requestIP: (req: Request) => { address?: string } | null };

let serverRef: ServerLike | null = null;

export function setServerRef(server: ServerLike | null) {
  serverRef = server;
}

export function getServerRef(): ServerLike | null {
  return serverRef;
}
