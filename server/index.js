import "dotenv/config";
import express from "express";
import cors from "cors";
import { fetchTuyaHomes, fetchTuyaAutomations } from "./tuya.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const demoHomes = [
  { homeId: "home-1", name: "Main Home" },
  { homeId: "home-2", name: "Second Home" },
  { homeId: "home-3", name: "Office" }
];

const demoAutomations = {
  "home-1": [
    { id: "a1", name: "Living room AC – morning", weekdays: [1,2,3,4,5], start: "06:30", end: "07:30", enabled: true },
    { id: "a2", name: "Boiler", weekdays: [1,2,3,4,5], start: "06:45", end: "07:15", enabled: true },
    { id: "a3", name: "Garden lights", weekdays: [0,1,2,3,4,5,6], start: "18:00", end: "23:00", enabled: true },
    { id: "a4", name: "Bedroom AC", weekdays: [0,1,2,3,4,5,6], start: "22:00", end: "23:30", enabled: false },
    { id: "a5", name: "Shabbat preparation", weekdays: [5], start: "14:00", end: "15:00", enabled: true }
  ],
  "home-2": [
    { id: "b1", name: "Hall lights", weekdays: [0,1,2,3,4,5,6], start: "17:30", end: "22:30", enabled: true },
    { id: "b2", name: "Air conditioning", weekdays: [1,2,3,4,5], start: "08:00", end: "09:00", enabled: true }
  ],
  "home-3": [
    { id: "c1", name: "Office opening", weekdays: [0,1,2,3,4], start: "07:45", end: "08:15", enabled: true }
  ]
};

app.get("/api/health", (_req, res) => res.json({ ok: true, mode: process.env.TUYA_DEMO_MODE === "false" ? "tuya" : "demo" }));

app.get("/api/homes", async (_req, res) => {
  try {
    if (process.env.TUYA_DEMO_MODE === "false") return res.json(await fetchTuyaHomes());
    res.json(demoHomes);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get("/api/homes/:homeId/automations", async (req, res) => {
  try {
    if (process.env.TUYA_DEMO_MODE === "false") return res.json(await fetchTuyaAutomations(req.params.homeId));
    res.json(demoAutomations[req.params.homeId] ?? []);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`API listening at http://localhost:${port}`));



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Your existing API routes should be registered above this section.

// Serve React production build
const clientDist = path.resolve(__dirname, "../client/dist");

app.use(express.static(clientDist));

// React fallback for frontend routes
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(path.join(clientDist, "index.html"));
});