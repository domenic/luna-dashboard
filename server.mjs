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

app.delete("/api/potty/:id", async (c) => {
  const data = await readData();
  data.pottyLog = (data.pottyLog || []).filter(e => e.id !== Number(c.req.param("id")));
  await writeData(data);
  return c.json(data.pottyLog);
});

// Weather proxy (Open-Meteo)
const WEATHER_LAT = process.env.WEATHER_LAT;
const WEATHER_LON = process.env.WEATHER_LON;
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
  + "?latitude=" + WEATHER_LAT + "&longitude=" + WEATHER_LON
  + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code"
  + "&daily=temperature_2m_max,temperature_2m_min"
  + "&timezone=Asia%2FTokyo&forecast_days=1";

let weatherLocation;
async function getWeatherLocation() {
  if (weatherLocation !== undefined) return weatherLocation;
  try {
    const url = "https://nominatim.openstreetmap.org/reverse?lat=" + WEATHER_LAT
      + "&lon=" + WEATHER_LON + "&format=json&zoom=14&accept-language=en";
    const resp = await fetch(url, {
      headers: { "User-Agent": "luna-dashboard/1.0" },
    });
    const data = await resp.json();
    const a = data.address;
    weatherLocation = a.neighbourhood || a.suburb || a.town || a.city || "";
    if (a.city_district || a.city) {
      const district = a.city_district || a.city;
      if (district !== weatherLocation) weatherLocation += ", " + district;
    }
  } catch {
    weatherLocation = "";
  }
  return weatherLocation;
}

app.get("/api/weather", async (c) => {
  try {
    const [resp, location] = await Promise.all([fetch(WEATHER_URL), getWeatherLocation()]);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const weather = await resp.json();
    weather.location = location;
    return c.json(weather);
  } catch (err) {
    console.error("Weather fetch failed:", err);
    return c.json({ error: "Failed to fetch weather" }, 502);
  }
});

// Static files
app.use("/*", serveStatic({ root: "./public" }));

const PORT = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log("Luna dashboard running at http://localhost:" + PORT);
});
