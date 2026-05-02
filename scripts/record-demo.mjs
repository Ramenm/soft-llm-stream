import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const recordingModes = {
  client: {
    durationMs: 16000,
    trace: "showcase-chat",
    profile: "fastFirst",
  },
  scroll: {
    durationMs: 12000,
    trace: "ramp-up-long",
    profile: "fastFirst",
  },
  gap: {
    durationMs: 24000,
    trace: "tool-call-gap",
    profile: "softFinish",
  },
  slow: {
    durationMs: 26000,
    trace: "realistic-chat-short",
    profile: "fastFirst",
  },
};

const defaults = {
  mode: "client",
  ...recordingModes.client,
  fps: 12,
  width: 1440,
  height: 1080,
  mp4Path: "docs/assets/demo-recording.mp4",
  gifPath: "docs/assets/demo-recording.gif",
  posterPath: "docs/assets/demo-recording-poster.jpg",
};

function parseArgs(argv) {
  const overrides = {};

  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/u.exec(arg);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    if (key === "mode") overrides.mode = value;
    if (key === "duration-ms") overrides.durationMs = Number(value);
    if (key === "fps") overrides.fps = Number(value);
    if (key === "width") overrides.width = Number(value);
    if (key === "height") overrides.height = Number(value);
    if (key === "trace") overrides.trace = value;
    if (key === "profile") overrides.profile = value;
    if (key === "mp4") overrides.mp4Path = value;
    if (key === "gif") overrides.gifPath = value;
    if (key === "poster") overrides.posterPath = value;
  }

  const mode = overrides.mode ?? defaults.mode;
  if (!Object.hasOwn(recordingModes, mode)) {
    throw new Error(
      `Unknown recording mode "${mode}". Use one of: ${Object.keys(recordingModes).join(", ")}.`,
    );
  }

  return {
    ...defaults,
    ...recordingModes[mode],
    ...overrides,
    mode,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn(process.platform === "win32" ? "where.exe" : "which", [command], {
      stdio: "ignore",
    });
    child.once("exit", (code) => resolve(code === 0));
    child.once("error", () => resolve(false));
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      ...options,
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port == null) {
          reject(new Error("Unable to allocate a local port."));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHttp(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(150);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "msedge",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates.find((candidate) => !path.isAbsolute(candidate)) ?? null;
}

async function getPageWebSocket(debugPort) {
  const deadline = Date.now() + 10000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const pages = await response.json();
      const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(150);
  }

  throw lastError ?? new Error("Timed out waiting for browser DevTools page target.");
}

function createCdpClient(webSocketUrl) {
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  const socket = new WebSocket(webSocketUrl);

  socket.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);

    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) {
        reject(new Error(payload.error.message ?? JSON.stringify(payload.error)));
        return;
      }
      resolve(payload.result);
      return;
    }

    if (payload.method && listeners.has(payload.method)) {
      for (const listener of listeners.get(payload.method)) {
        listener(payload.params);
      }
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    async send(method, params = {}) {
      await opened;
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    once(method) {
      return new Promise((resolve) => {
        const listener = (params) => {
          const set = listeners.get(method);
          set.delete(listener);
          resolve(params);
        };
        if (!listeners.has(method)) {
          listeners.set(method, new Set());
        }
        listeners.get(method).add(listener);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browser = findBrowserExecutable();

  if (!browser) {
    throw new Error("No Chrome/Edge executable found. Set CHROME_PATH or EDGE_PATH.");
  }

  if (!(await commandExists("ffmpeg"))) {
    throw new Error("ffmpeg is required to encode the recording.");
  }

  const demoPort = await getFreePort();
  const debugPort = await getFreePort();
  const demoUrl = `http://127.0.0.1:${demoPort}/`;
  const recordingRoot = path.join(rootDir, ".omx", "recordings");
  const runDir = path.join(recordingRoot, new Date().toISOString().replaceAll(/[:.]/gu, "-"));
  const framesDir = path.join(runDir, "frames");
  const profileDir = path.join(runDir, "browser-profile");

  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(path.dirname(path.resolve(rootDir, args.mp4Path)), { recursive: true });

  const server = spawn(process.execPath, ["./scripts/demo-browser-server.mjs"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(demoPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browserProcess = null;
  let cdp = null;

  try {
    await waitForHttp(demoUrl);

    browserProcess = spawn(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profileDir}`,
        `--window-size=${args.width},${args.height}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    const webSocketUrl = await getPageWebSocket(debugPort);
    cdp = createCdpClient(webSocketUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: args.width,
      height: args.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const load = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: demoUrl });
    await load;
    await cdp.send("Runtime.evaluate", {
      expression: `
        document.body.dataset.recording = 'true';
        document.querySelector('#loop-toggle').checked = false;
        document.querySelector('#trace-select').value = ${JSON.stringify(args.trace)};
        document.querySelector('#profile-select').value = ${JSON.stringify(args.profile)};
        document.querySelector('#restart-button').click();
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      `,
      awaitPromise: true,
    });

    const frameCount = Math.max(1, Math.round((args.durationMs / 1000) * args.fps));
    const frameDelayMs = 1000 / args.fps;

    for (let index = 0; index < frameCount; index += 1) {
      const frameStartedAt = Date.now();
      const screenshot = await cdp.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 84,
        fromSurface: true,
      });
      const framePath = path.join(framesDir, `frame-${String(index).padStart(5, "0")}.jpg`);
      fs.writeFileSync(framePath, Buffer.from(screenshot.data, "base64"));
      const elapsed = Date.now() - frameStartedAt;
      await delay(Math.max(0, frameDelayMs - elapsed));
    }

    const mp4Path = path.resolve(rootDir, args.mp4Path);
    const gifPath = path.resolve(rootDir, args.gifPath);
    const posterPath = path.resolve(rootDir, args.posterPath);
    const inputPattern = path.join(framesDir, "frame-%05d.jpg");

    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-framerate",
      String(args.fps),
      "-i",
      inputPattern,
      "-vf",
      "scale=1280:-2:flags=lanczos",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4Path,
    ]);

    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      "5",
      "-i",
      mp4Path,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-update",
      "1",
      posterPath,
    ]);

    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      mp4Path,
      "-vf",
      "fps=8,scale=960:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5",
      "-loop",
      "0",
      gifPath,
    ]);

    const mp4Size = fs.statSync(mp4Path).size;
    const gifSize = fs.statSync(gifPath).size;
    const posterSize = fs.statSync(posterPath).size;

    console.log(
      JSON.stringify(
        {
          demoUrl,
          durationMs: args.durationMs,
          fps: args.fps,
          mode: args.mode,
          trace: args.trace,
          profile: args.profile,
          frames: frameCount,
          outputs: {
            mp4: { path: path.relative(rootDir, mp4Path), bytes: mp4Size },
            gif: { path: path.relative(rootDir, gifPath), bytes: gifSize },
            poster: { path: path.relative(rootDir, posterPath), bytes: posterSize },
          },
        },
        null,
        2,
      ),
    );
  } finally {
    cdp?.close();
    if (browserProcess && !browserProcess.killed) {
      browserProcess.kill("SIGTERM");
    }
    if (!server.killed) {
      server.kill("SIGTERM");
    }
  }
}

await main();
