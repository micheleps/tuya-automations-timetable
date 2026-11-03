# Tuya Weekly Planner (starter)

A React + TypeScript weekly calendar UI with a Node/Express backend scaffold.

## Requirements
- Node.js 20+
- Tuya IoT Cloud Access ID and Access Secret

## 1. Configure credentials
Copy `server/.env.example` to `server/.env` and fill in your credentials.
For Central Europe, the API base URL is `https://openapi.tuyaeu.com`.

Do not put credentials in the React client or commit `server/.env`.

## 2. Run
In one terminal:
```bash
cd server
npm install
npm run dev
```
In another terminal:
```bash
cd client
npm install
npm run dev
```
Open http://localhost:5173.

## Current status
The calendar UI runs with sample data so you can evaluate the layout immediately.
The backend exposes `/api/homes` and `/api/homes/:homeId/automations`; its Tuya adapter is deliberately isolated in `server/tuya.js`.
Tuya's exact home/automation endpoints and response fields can vary with the API services authorized on a project. Before enabling live mode, verify the API permissions and endpoint/response shape in your Tuya project. Do not assume that a successful token request means the scene/automation APIs are authorized.

## Schedule semantics
The UI labels each event as a **time window**. It does not claim that the automation's actions run for the entire window. Some Tuya automations are triggered by a condition within a time range and do not have a fixed stop time. Those should be shown as a window, not as an actual execution duration.
