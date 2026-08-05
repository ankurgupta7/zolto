import "dotenv/config";
import { createServer } from "node:http";
import net from "node:net";
import { createApp } from "./app";
import { serveStatic, setupVite } from "./vite";
import { startChannelIntake } from "../channels";
import { ensureDailyPosAttributionJob } from "../scheduled";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = await createApp();
  const server = createServer(app);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Non-HTTP surfaces, deliberately outside createApp() so in-process app
  // tests never open live sockets or talk to the heartbeat service:
  // the Discord intake gateway and the nightly POS-attribution schedule.
  startChannelIntake();
  void ensureDailyPosAttributionJob();
}

startServer().catch(console.error);
