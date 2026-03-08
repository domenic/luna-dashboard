import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFile, writeFile, access } from "fs/promises";
import { join } from "path";

const DATA_PATH = process.env.DATA_PATH || join(import.meta.dirname, "data.json");

const DEFAULT_DATA = { weights: [], events: [], nextEventID: 1, pottyLog: [], nextPottyID: 1 };

const app = new Hono();

app.use("/api/*", cors());

async function readData() {
  try {
    const raw = await readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_DATA };
  }
}

async function writeData(data) {
  await writeFile(DATA_PATH, JSON.stringify(data, undefined, 2) + "\n");
}

// Weights
app.get("/api/weights", async (c) => {
  const data = await readData();
  return c.json(data.weights);
});

app.post("/api/weights", async (c) => {
  const data = await readData();
  const { date, grams } = await c.req.json();
  data.weights = data.weights.filter(w => w.date !== date);
  data.weights.push({ date, grams });
  data.weights.sort((a, b) => a.date.localeCompare(b.date));
  await writeData(data);
  return c.json(data.weights);
});

app.delete("/api/weights/:date", async (c) => {
  const data = await readData();
  data.weights = data.weights.filter(w => w.date !== c.req.param("date"));
  await writeData(data);
  return c.json(data.weights);
});

// Events
app.get("/api/events", async (c) => {
  const data = await readData();
  return c.json(data.events);
});

app.post("/api/events", async (c) => {
  const data = await readData();
  const body = await c.req.json();
  const id = data.nextEventID || 1;
  data.nextEventID = id + 1;
  data.events.push({ id, ...body });
  await writeData(data);
  return c.json(data.events);
});

app.delete("/api/events/:id", async (c) => {
  const data = await readData();
  data.events = data.events.filter(e => e.id !== Number(c.req.param("id")));
  await writeData(data);
  return c.json(data.events);
});

// Potty log
app.get("/api/potty", async (c) => {
  const data = await readData();
  return c.json(data.pottyLog || []);
});

app.post("/api/potty", async (c) => {
  const data = await readData();
  const body = await c.req.json();
  const id = data.nextPottyID || 1;
  data.nextPottyID = id + 1;
  if (!data.pottyLog) data.pottyLog = [];
  data.pottyLog.push({ id, type: body.type, time: body.time, note: body.note, accident: body.accident || false });
  delete data.lastAccident;
  await writeData(data);
  return c.json(data.pottyLog);
});

app.patch("/api/potty/:id", async (c) => {
  const data = await readData();
  const entry = (data.pottyLog || []).find(e => e.id === Number(c.req.param("id")));
  if (!entry) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json();
  if (body.note !== undefined) entry.note = body.note || undefined;
  if (body.time !== undefined) entry.time = body.time;
  await writeData(data);
  return c.json(data.pottyLog);
});

app.delete("/api/potty/:id", async (c) => {
  const data = await readData();
  data.pottyLog = (data.pottyLog || []).filter(e => e.id !== Number(c.req.param("id")));
  await writeData(data);
  return c.json(data.pottyLog);
});

// Static files
app.use("/*", serveStatic({ root: "./public" }));

const PORT = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log("Luna dashboard running at http://localhost:" + PORT);
});
