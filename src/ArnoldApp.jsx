import { useState, useRef, useEffect, useCallback } from "react";

/* ─── ARNOLD SYSTEM PROMPT ──────────────────────────────────────────────── */
const ARNOLD_SYSTEM = `Eres Arnold, el Pulpo Fitness del Clan de los Pulpos. Tu trabajo es motivar, analizar comida y dar seguimiento fitness.

PERFIL DEL USUARIO:
- 38 años (39 en junio 2026), 175cm, 73-76kg, ~20-24% grasa corporal
- TMB estimada: ~1,750 kcal/día
- Meta calórica diaria: ~2,400-2,600 kcal (recomposición)
- Meta proteína: ~140-155g/día | Carbos: ~250g | Grasas: ~65g
- Objetivo: Rehabilitación + estética (recomposición corporal)
- Deportes: Béisbol, Pádel, Gym ocasional
- LESIONES ACTIVAS: Tendinopatía bilateral en rodillas + mini desgarre isquiotibial izquierdo
- Sin pescados/mariscos. Ayuno intermitente (18-20h). Insomnio recurrente. Migrañas ocasionales.
- Posible inflamación alimentaria con disparadores no identificados.

PERSONALIDAD:
- Directo, intenso, motivador. Eres un pulpo musculoso con gorra y hoodie azul.
- Habla español siempre, tutea al usuario
- Celebra logros con entusiasmo exagerado
- Regaña con cariño cuando come mal o no entrena
- Hace referencias a ser un pulpo cuando es divertido
- NUNCA sugiere ejercicios de impacto en rodillas

CUANDO EL USUARIO SUBE UNA FOTO DE COMIDA:
Responde ÚNICAMENTE con este JSON (sin texto extra, sin backticks, sin markdown):
{
  "type": "food_analysis",
  "meal_name": "nombre descriptivo de la comida",
  "ingredients": [
    {"item": "nombre del ingrediente", "portion": "cantidad estimada", "calories": número, "protein": número, "carbs": número, "fat": número}
  ],
  "totals": {"calories": número, "protein": número, "carbs": número, "fat": número},
  "quality_score": número del 1 al 10,
  "arnold_says": "comentario motivador o crítico de Arnold en español, máximo 2 oraciones",
  "tips": ["tip personalizado 1", "tip personalizado 2"]
}

PARA CONVERSACIÓN NORMAL:
Responde directo, motivador, con personalidad. Máximo 3 párrafos cortos.

TRACKING DIARIO — Arnold debe preguntar proactivamente:
- Si el usuario no ha reportado pasos del día, pregunta: "¿Cuántos pasos llevas hoy?"
- Si no ha reportado sueño, pregunta: "¿Cuántas horas dormiste anoche?"
- Si no ha reportado agua, pregunta: "¿Cuánta agua llevas?"
- Los LUNES, pide peso y medidas: "¡Es lunes de mediciones! ¿Te pesaste? Dime peso y medidas actuales."

Cuando el usuario reporta PASOS, SUEÑO, AGUA o PESO, responde con un JSON:
{"type": "tracking", "field": "nombre_campo", "value": número, "arnold_says": "comentario"}
Campos válidos: "pasos" (número), "sueño" (horas), "agua" (litros), "peso" (kg)

Cuando reporta ACTIVIDAD (jugó béisbol, pádel, gym), responde con:
{"type": "activity", "sport": "baseball|padel|gym", "hours": número, "estimated_kcal": número, "arnold_says": "comentario"}`;


/* ─── NOTION CONFIG ─────────────────────────────────────────────────────── */
const NOTION_MCP = { type: "url", url: "https://mcp.notion.com/mcp", name: "notion-mcp" };
const GCAL_MCP = { type: "url", url: "https://calendarmcp.googleapis.com/mcp/v1", name: "gcal-mcp" };
const DS_COMIDAS = "cce990f8-266c-4294-b587-f668afe7f327";
const DS_REGISTRO = "a4fbfc8b-86a0-4dea-986a-cdef88986c2a";
const STORAGE_KEY = "arnold-daily";

/* ─── NOTION SYNC — cumulative daily update ─────────────────────────────── */
async function notionApiCall(prompt) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system: `You are a silent data sync agent. Execute the Notion tool calls requested and respond ONLY with a short JSON status. No other text.`,
        messages: [{ role: "user", content: prompt }],
        mcp_servers: [NOTION_MCP],
      }),
    });
    const data = await res.json();
    return data.content?.some(b => b.type === "mcp_tool_use" || b.type === "mcp_tool_result") ? "synced" : "error";
  } catch (e) { console.error("Notion API error:", e); return "error"; }
}

async function syncFoodToNotion(analysis, cumulativeTotals) {
  const today = new Date().toISOString().split("T")[0];
  const ingredientLines = analysis.ingredients.map(ing =>
    `- "Comida / Alimento": "${ing.item}", "Tamaño de porción": "${ing.portion}", "Calorías (porción)": ${ing.calories}, "Proteína (g)": ${ing.protein}, "Carbohidratos (g)": ${ing.carbs}, "Grasas (g)": ${ing.fat}, "Notas": "${analysis.meal_name} - ${today}"`
  ).join("\n");

  return notionApiCall(`Do TWO things in Notion:

1) In data source ${DS_COMIDAS}, create one page PER ingredient:
${ingredientLines}

2) In data source ${DS_REGISTRO}, search for a page where Día = "${today}".
   - If it EXISTS: update it with these CUMULATIVE totals:
     "Calorías consumidas": ${cumulativeTotals.cal}, "Proteína (g)": ${cumulativeTotals.p}, "Carbohidratos (g)": ${cumulativeTotals.c}, "Grasas (g)": ${cumulativeTotals.f}
   - If it DOES NOT exist: create a new page:
     "Día": "${today}", "date:Fecha:start": "${today}", "date:Fecha:is_datetime": 0, "Calorías consumidas": ${cumulativeTotals.cal}, "Proteína (g)": ${cumulativeTotals.p}, "Carbohidratos (g)": ${cumulativeTotals.c}, "Grasas (g)": ${cumulativeTotals.f}

Execute now.`);
}

async function syncTrackingToNotion(field, value) {
  const today = new Date().toISOString().split("T")[0];
  return notionApiCall(`In data source ${DS_REGISTRO}, search for a page where Día = "${today}".
If it exists, update "${field}" to ${value}.
If it doesn't exist, create a new page with "Día": "${today}", "date:Fecha:start": "${today}", "date:Fecha:is_datetime": 0, "${field}": ${value}.
Execute now.`);
}

/* ─── PERSISTENCE ────────────────────────────────────────────────────────── */
async function loadDailyData() {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    if (result) {
      const data = JSON.parse(result.value);
      const today = new Date().toISOString().split("T")[0];
      if (data.date === today) return data;
    }
  } catch (e) { /* no data yet */ }
  return null;
}

async function saveDailyData(meals, activity) {
  try {
    const today = new Date().toISOString().split("T")[0];
    await window.storage.set(STORAGE_KEY, JSON.stringify({
      date: today,
      meals: meals.map(m => ({ id: m.id, analysis: m.analysis, time: m.time })),
      activity,
    }));
  } catch (e) { console.error("Storage save error:", e); }
}

/* ─── THEME — DARK GLASSMORPHISM ───────────────────────────────────────── */
const T = {
  // Base dark blues
  bg: "#080C14",
  bgCard: "rgba(15, 20, 35, 0.7)",
  bgGlass: "rgba(18, 24, 42, 0.55)",
  bgGlassLight: "rgba(25, 33, 56, 0.45)",
  bgSurface: "rgba(20, 28, 48, 0.8)",
  bgHover: "rgba(30, 40, 65, 0.6)",

  // Borders
  border: "rgba(255, 255, 255, 0.06)",
  borderLight: "rgba(255, 255, 255, 0.1)",
  borderAccent: "rgba(232, 93, 58, 0.3)",

  // Text
  textPrimary: "#F0F2F5",
  textSecondary: "rgba(200, 210, 225, 0.7)",
  textMuted: "rgba(160, 175, 195, 0.5)",

  // Accent — Arnold's terracotta/orange
  accent: "#E85D3A",
  accentLight: "#FF7A54",
  accentSoft: "rgba(232, 93, 58, 0.15)",
  accentGlow: "rgba(232, 93, 58, 0.25)",

  // Secondary — Teal/Cyan
  teal: "#4ECDC4",
  tealSoft: "rgba(78, 205, 196, 0.12)",
  tealText: "#6EE7DE",

  // Semantic
  green: "#34D399",
  greenSoft: "rgba(52, 211, 153, 0.12)",
  greenText: "#6EE7B7",
  red: "#F87171",
  redSoft: "rgba(248, 113, 113, 0.12)",
  redText: "#FCA5A5",
  blue: "#60A5FA",
  blueSoft: "rgba(96, 165, 250, 0.12)",
  blueText: "#93C5FD",
  orange: "#FB923C",
  orangeSoft: "rgba(251, 146, 60, 0.12)",
  orangeText: "#FDBA74",
  purple: "#A78BFA",
  purpleSoft: "rgba(167, 139, 250, 0.12)",

  // Misc
  white: "#FFFFFF",
};

/* ─── STYLES ────────────────────────────────────────────────────────────── */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

:root {
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --blur-glass: 20px;
  --blur-heavy: 40px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 24px;
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.app {
  font-family: var(--font-body);
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${T.bg};
  background-image: 
    radial-gradient(ellipse at 20% 0%, rgba(232, 93, 58, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(78, 205, 196, 0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(15, 20, 40, 1) 0%, ${T.bg} 100%);
  color: ${T.textPrimary};
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Header */
.header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  background: ${T.bgGlass};
  backdrop-filter: blur(var(--blur-heavy));
  -webkit-backdrop-filter: blur(var(--blur-heavy));
  border-bottom: 1px solid ${T.border};
  flex-shrink: 0;
  position: relative;
}
.header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20px;
  right: 20px;
  height: 1px;
  background: linear-gradient(90deg, transparent, ${T.accent}40, transparent);
}
.header-avatar {
  width: 46px;
  height: 46px;
  border-radius: var(--radius-md);
  background: ${T.accentSoft};
  border: 1.5px solid ${T.borderAccent};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  position: relative;
  box-shadow: 0 0 20px ${T.accentGlow};
}
.header-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${T.green};
  position: absolute;
  bottom: -2px;
  right: -2px;
  border: 2.5px solid ${T.bg};
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.5);
}
.header-info h1 {
  font-size: 17px;
  font-weight: 700;
  color: ${T.textPrimary};
  letter-spacing: -0.3px;
}
.header-info p {
  font-size: 12px;
  color: ${T.textSecondary};
  font-weight: 400;
  margin-top: 2px;
}

/* Tab bar */
.tabs {
  display: flex;
  background: ${T.bgGlass};
  backdrop-filter: blur(var(--blur-glass));
  -webkit-backdrop-filter: blur(var(--blur-glass));
  border-bottom: 1px solid ${T.border};
  flex-shrink: 0;
  padding: 0 16px;
  gap: 4px;
}
.tab {
  flex: 1;
  padding: 12px 8px;
  border: none;
  background: transparent;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: ${T.textMuted};
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
.tab:hover { 
  color: ${T.textSecondary}; 
  background: ${T.bgHover};
}
.tab.active {
  color: ${T.textPrimary};
  font-weight: 600;
  border-bottom-color: ${T.accent};
  background: rgba(232, 93, 58, 0.05);
}
.tab-badge {
  background: ${T.accent};
  color: ${T.white};
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  box-shadow: 0 0 10px ${T.accentGlow};
}

/* Chat area */
.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.chat-scroll::-webkit-scrollbar { width: 3px; }
.chat-scroll::-webkit-scrollbar-track { background: transparent; }
.chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

/* Messages */
.msg { display: flex; gap: 10px; align-items: flex-end; animation: msgIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.msg.user { flex-direction: row-reverse; }
@keyframes msgIn { 
  from { opacity: 0; transform: translateY(12px) scale(0.97); } 
  to { opacity: 1; transform: translateY(0) scale(1); } 
}

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: ${T.accentSoft};
  border: 1px solid ${T.borderAccent};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}

.bubble {
  max-width: 78%;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  letter-spacing: -0.1px;
}
.bubble.arnold {
  background: ${T.bgGlass};
  backdrop-filter: blur(var(--blur-glass));
  -webkit-backdrop-filter: blur(var(--blur-glass));
  color: ${T.textPrimary};
  border: 1px solid ${T.borderLight};
  border-bottom-left-radius: 4px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}
.bubble.user {
  background: linear-gradient(135deg, ${T.accent}, #C94A2E);
  color: ${T.white};
  border-bottom-right-radius: 4px;
  box-shadow: 0 4px 20px ${T.accentGlow};
}

.bubble img {
  width: 100%;
  max-width: 220px;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  display: block;
  border: 1px solid ${T.border};
}

.bubble-time {
  font-size: 10px;
  color: ${T.textMuted};
  margin-top: 5px;
  font-weight: 400;
}
.msg.user .bubble-time { text-align: right; }

/* Analysis card inside bubble */
.analysis {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid ${T.borderLight};
}
.analysis-title {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 10px;
  color: ${T.textPrimary};
}
.analysis-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 6px 0;
  border-bottom: 1px solid ${T.border};
  color: ${T.textSecondary};
}
.analysis-row:last-of-type { border-bottom: none; }
.analysis-row span:last-child { color: ${T.textPrimary}; font-weight: 600; }
.analysis-macros {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.macro-pill {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
  backdrop-filter: blur(10px);
}
.analysis-total {
  font-size: 20px;
  font-weight: 800;
  color: ${T.accentLight};
  margin-top: 10px;
  letter-spacing: -0.5px;
}
.analysis-score {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  margin-top: 8px;
}
.analysis-tips {
  margin-top: 10px;
  font-size: 12px;
  color: ${T.textSecondary};
  list-style: none;
}
.analysis-tips li::before { content: "⚡ "; }
.analysis-tips li { margin-bottom: 5px; line-height: 1.5; }

.notion-sync {
  margin-top: 8px;
  font-size: 11px;
  color: ${T.teal};
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  opacity: 0.8;
  transition: color 0.3s;
}
.notion-sync.error { color: ${T.orange}; }

/* Typing indicator */
.typing { display: flex; gap: 10px; align-items: flex-end; }
.typing-dots { 
  display: flex; 
  gap: 5px; 
  padding: 14px 18px; 
  background: ${T.bgGlass}; 
  backdrop-filter: blur(var(--blur-glass));
  border: 1px solid ${T.borderLight}; 
  border-radius: var(--radius-lg); 
  border-bottom-left-radius: 4px; 
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}
.typing-dot { 
  width: 7px; 
  height: 7px; 
  border-radius: 50%; 
  background: ${T.accent}; 
  animation: blink 1.4s infinite; 
  box-shadow: 0 0 6px ${T.accentGlow};
}
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%,100%{opacity:1}50%{opacity:0.2} }
.typing-avatar { animation: pulpoBounce 0.8s ease infinite; }
@keyframes pulpoBounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)} }

/* Image preview */
.img-preview {
  padding: 12px 20px;
  background: ${T.bgGlass};
  backdrop-filter: blur(var(--blur-glass));
  border-top: 1px solid ${T.border};
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.img-preview img {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  border: 1px solid ${T.borderLight};
}
.img-preview-remove {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: ${T.redSoft};
  color: ${T.red};
  border: 1px solid rgba(248, 113, 113, 0.2);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition);
}
.img-preview-remove:hover { background: rgba(248, 113, 113, 0.25); }

/* Input bar */
.input-bar {
  padding: 14px 20px;
  background: ${T.bgGlass};
  backdrop-filter: blur(var(--blur-heavy));
  -webkit-backdrop-filter: blur(var(--blur-heavy));
  border-top: 1px solid ${T.border};
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-shrink: 0;
}
.input-bar textarea {
  flex: 1;
  border: 1px solid ${T.borderLight};
  border-radius: var(--radius-md);
  padding: 11px 16px;
  font-family: var(--font-body);
  font-size: 14px;
  resize: none;
  background: ${T.bgSurface};
  color: ${T.textPrimary};
  outline: none;
  max-height: 80px;
  line-height: 1.5;
  transition: var(--transition);
  letter-spacing: -0.1px;
}
.input-bar textarea:focus { 
  border-color: ${T.accent}60; 
  box-shadow: 0 0 0 3px ${T.accentSoft};
}
.input-bar textarea::placeholder { color: ${T.textMuted}; }
.btn-icon {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  border: none;
  transition: var(--transition);
  flex-shrink: 0;
}
.btn-icon:active { transform: scale(0.92); }
.btn-cam { 
  background: ${T.bgSurface}; 
  border: 1px solid ${T.borderLight}; 
}
.btn-cam:hover { background: ${T.bgHover}; border-color: ${T.accent}40; }
.btn-cam.has-img { 
  background: ${T.accentSoft}; 
  border-color: ${T.accent}60; 
  box-shadow: 0 0 12px ${T.accentGlow};
}
.btn-send { 
  background: linear-gradient(135deg, ${T.accent}, #C94A2E); 
  color: ${T.white}; 
  box-shadow: 0 4px 14px ${T.accentGlow};
}
.btn-send:hover { box-shadow: 0 6px 20px rgba(232, 93, 58, 0.4); transform: translateY(-1px); }
.btn-send:disabled { opacity: 0.3; cursor: default; box-shadow: none; transform: none; }

/* ─── DASHBOARD ─────────────────────────────────────────────────────── */
.dash {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dash::-webkit-scrollbar { width: 3px; }
.dash::-webkit-scrollbar-track { background: transparent; }
.dash::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

.card {
  background: ${T.bgGlass};
  backdrop-filter: blur(var(--blur-glass));
  -webkit-backdrop-filter: blur(var(--blur-glass));
  border: 1px solid ${T.borderLight};
  border-radius: var(--radius-xl);
  padding: 20px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.15);
  transition: var(--transition);
}
.card:hover { border-color: ${T.borderAccent}; }

/* Calorie card */
.cal-label { font-size: 12px; color: ${T.textMuted}; font-weight: 500; text-transform: uppercase; letter-spacing: 0.8px; }
.cal-number { font-size: 38px; font-weight: 800; color: ${T.textPrimary}; margin: 6px 0; letter-spacing: -1.5px; }
.cal-number span { font-size: 16px; font-weight: 400; color: ${T.textMuted}; letter-spacing: 0; }
.cal-bar { 
  width: 100%; 
  height: 8px; 
  background: rgba(255,255,255,0.06); 
  border-radius: 4px; 
  margin: 14px 0 12px; 
  overflow: hidden; 
}
.cal-fill { 
  height: 100%; 
  border-radius: 4px; 
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); 
  box-shadow: 0 0 10px currentColor;
}
.deficit-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.2px;
}

/* Macro cards */
.macros-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.macro-card {
  padding: 16px 12px;
  border-radius: var(--radius-md);
  text-align: center;
  border: 1px solid ${T.border};
  backdrop-filter: blur(10px);
  transition: var(--transition);
}
.macro-card:hover { border-color: ${T.borderLight}; transform: translateY(-2px); }
.macro-card-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; }
.macro-card-val { font-size: 22px; font-weight: 800; margin: 6px 0; display: flex; align-items: center; justify-content: center; gap: 4px; letter-spacing: -0.5px; }
.macro-card-meta { font-size: 11px; opacity: 0.6; }
.macro-arrow { font-size: 16px; }

/* Activity */
.act-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.act-item {
  text-align: center;
  padding: 14px;
  border-radius: var(--radius-md);
  background: ${T.bgSurface};
  border: 1px solid ${T.border};
  transition: var(--transition);
}
.act-item:hover { border-color: ${T.borderLight}; }
.act-item-icon { font-size: 22px; margin-bottom: 6px; }
.act-item-label { font-size: 10px; color: ${T.textMuted}; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
.act-item-val { font-size: 20px; font-weight: 800; color: ${T.textPrimary}; margin: 4px 0; letter-spacing: -0.5px; }
.act-item-sub { font-size: 11px; color: ${T.textSecondary}; }
.act-item.inactive { opacity: 0.35; }

/* Balance */
.balance {
  background: ${T.bgGlass};
  backdrop-filter: blur(var(--blur-glass));
  border-left: 3px solid ${T.teal};
  padding: 16px 18px;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  border: 1px solid ${T.border};
  border-left: 3px solid ${T.teal};
}
.balance-row { font-size: 12px; color: ${T.textMuted}; margin-bottom: 5px; font-weight: 400; }
.balance-total { font-size: 14px; font-weight: 600; color: ${T.textSecondary}; margin: 8px 0; }
.balance-result { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 6px; letter-spacing: -0.3px; }

/* Empty state */
.empty { text-align: center; padding: 50px 20px; color: ${T.textMuted}; }
.empty-icon { font-size: 52px; margin-bottom: 14px; opacity: 0.6; }
.empty p { font-size: 13px; margin-bottom: 5px; }
.empty p:first-of-type { color: ${T.textSecondary}; font-weight: 500; }

/* Responsive */
@media (min-width: 768px) {
  .app { 
    max-width: 480px; 
    margin: 0 auto; 
    border-left: 1px solid ${T.border}; 
    border-right: 1px solid ${T.border}; 
    box-shadow: 0 0 80px rgba(232, 93, 58, 0.05);
  }
}

/* Subtle ambient animation */
@keyframes ambientGlow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}
`;

/* ─── HELPERS ───────────────────────────────────────────────────────────── */
const timeStr = () => new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

const MacroArrow = ({ current, goal }) => {
  const pct = current / goal;
  if (pct >= 0.9) return <span className="macro-arrow" style={{ color: T.green }}>↑</span>;
  if (pct >= 0.6) return <span className="macro-arrow" style={{ color: T.orange }}>→</span>;
  return <span className="macro-arrow" style={{ color: T.red }}>↓</span>;
};

/* ─── ANALYSIS CARD ─────────────────────────────────────────────────────── */
const AnalysisCard = ({ data }) => {
  const scoreColor = data.quality_score >= 7 ? T.green : data.quality_score >= 5 ? T.orange : T.red;
  const scoreBg = data.quality_score >= 7 ? T.greenSoft : data.quality_score >= 5 ? T.orangeSoft : T.redSoft;
  return (
    <div className="analysis">
      <div className="analysis-title">🍽️ {data.meal_name}</div>
      {data.ingredients.map((ing, i) => (
        <div key={i} className="analysis-row">
          <span>{ing.item} <span style={{ color: T.textMuted }}>({ing.portion})</span></span>
          <span style={{ fontWeight: 600 }}>{ing.calories} kcal</span>
        </div>
      ))}
      <div className="analysis-macros">
        <span className="macro-pill" style={{ background: T.greenSoft, color: T.greenText }}>P: {data.totals.protein}g</span>
        <span className="macro-pill" style={{ background: T.blueSoft, color: T.blueText }}>C: {data.totals.carbs}g</span>
        <span className="macro-pill" style={{ background: T.orangeSoft, color: T.orangeText }}>G: {data.totals.fat}g</span>
      </div>
      <div className="analysis-total">{data.totals.calories} kcal</div>
      <span className="analysis-score" style={{ background: scoreBg, color: scoreColor }}>
        {"★".repeat(Math.round(data.quality_score / 2))} {data.quality_score}/10
      </span>
      {data.tips?.length > 0 && (
        <ul className="analysis-tips">
          {data.tips.map((tip, i) => <li key={i}>{tip}</li>)}
        </ul>
      )}
    </div>
  );
};

/* ─── MAIN APP ──────────────────────────────────────────────────────────── */
export default function ArnoldV3() {
  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState([
    { id: 1, from: "arnold", text: "OÍDO! 🐙💪 Soy Arnold, tu pulpo fitness. Aquí no hay excusas.\n\nMándame foto de lo que estás comiendo y te analizo los macros. O dime cómo te sientes, qué necesitas. ¡VAMOS!", time: timeStr() },
  ]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [meals, setMeals] = useState([]);
  const [activity, setActivity] = useState({ steps: 0, stepsKcal: 0, baseball: 0, baseballKcal: 0, padel: 0, padelKcal: 0, gym: 0, gymKcal: 0, sleep: 0, water: 0 });
  const [syncStatus, setSyncStatus] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);

  // Define goals first
  const GOALS = { calories: 2500, protein: 150, carbs: 250, fat: 65 };
  const TMB = 1750;

  const fileRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Load persisted data on mount
  useEffect(() => {
    (async () => {
      const saved = await loadDailyData();
      if (saved) {
        if (saved.meals?.length) setMeals(saved.meals);
        if (saved.activity) setActivity(saved.activity);
      }
      setDataLoaded(true);
    })();
  }, []);

  // Save data whenever meals or activity change
  useEffect(() => {
    if (dataLoaded) saveDailyData(meals, activity);
  }, [meals, activity, dataLoaded]);

  // Arnold's mood based on daily compliance
  const getArnoldMood = () => {
    const daily = meals.reduce((a, m) => {
      const t = m.analysis?.totals;
      return t ? { cal: a.cal + t.calories, p: a.p + t.protein, c: a.c + t.carbs, f: a.f + t.fat } : a;
    }, { cal: 0, p: 0, c: 0, f: 0 });

    const calsOk = daily.cal >= GOALS.calories * 0.8 && daily.cal <= GOALS.calories * 1.1;
    const proteinOk = daily.p >= GOALS.protein * 0.85;
    const sleepOk = activity.sleep >= 6;
    const waterOk = activity.water >= 2;
    const trainedOk = activity.baseball > 0 || activity.padel > 0 || activity.gym > 0 || activity.steps > 5000;

    const checksPassed = [calsOk, proteinOk, sleepOk, waterOk, trainedOk].filter(Boolean).length;

    if (checksPassed >= 4) return "happy";
    if (checksPassed <= 2) return "serious";
    return "happy";
  };

  const mood = getArnoldMood();
  const arnoldImg = {
    happy: "/arnold-happy.png",
    serious: "/arnold-serious.png",
    full: "/arnold-full.png"
  }[mood] || "/arnold-happy.png";

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImage(f);
    const r = new FileReader();
    r.onload = (ev) => setPreview(ev.target.result);
    r.readAsDataURL(f);
  };

  const clearImage = () => { setImage(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; };

  const send = useCallback(async () => {
    if (!input.trim() && !image) return;
    const hasImg = !!image;
    const txt = input.trim();

    let imgB64 = null;
    if (image) {
      imgB64 = await new Promise((res) => {
        const r = new FileReader();
        r.onload = (e) => res(e.target.result.split(",")[1]);
        r.readAsDataURL(image);
      });
    }

    const userMsg = { id: Date.now(), from: "user", text: txt || "Analiza mi comida", preview: hasImg ? preview : null, time: timeStr() };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    clearImage();
    setLoading(true);

    try {
      const hist = messages.filter((m) => m.id > 1).slice(-8).map((m) => ({
        role: m.from === "arnold" ? "assistant" : "user",
        content: m.text || "",
      }));

      const userContent = imgB64
        ? [
            { type: "image", source: { type: "base64", media_type: image.type, data: imgB64 } },
            { type: "text", text: txt || "¿Qué es esto que estoy comiendo? Analiza los macros detalladamente." },
          ]
        : txt;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: ARNOLD_SYSTEM,
          messages: [...hist, { role: "user", content: userContent }],
        }),
      });

      const data = await res.json();
      const raw = data.content?.[0]?.text || "";

      let arnoldMsg = { id: Date.now() + 1, from: "arnold", text: raw, time: timeStr() };

      // Try to parse JSON responses (food, tracking, activity)
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);

          if (parsed.type === "food_analysis" && hasImg) {
            arnoldMsg.analysis = parsed;
            arnoldMsg.text = parsed.arnold_says || "";
            const mealId = Date.now();
            arnoldMsg.mealId = mealId;

            // Calculate cumulative totals BEFORE adding this meal
            const prevTotals = meals.reduce((a, m) => {
              const t = m.analysis?.totals;
              return t ? { cal: a.cal + t.calories, p: a.p + t.protein, c: a.c + t.carbs, f: a.f + t.fat } : a;
            }, { cal: 0, p: 0, c: 0, f: 0 });

            const cumulative = {
              cal: prevTotals.cal + parsed.totals.calories,
              p: prevTotals.p + parsed.totals.protein,
              c: prevTotals.c + parsed.totals.carbs,
              f: prevTotals.f + parsed.totals.fat,
            };

            setMeals((p) => [...p, { id: mealId, analysis: parsed, time: timeStr() }]);
            setSyncStatus((s) => ({ ...s, [mealId]: "syncing" }));
            syncFoodToNotion(parsed, cumulative).then((status) => {
              setSyncStatus((s) => ({ ...s, [mealId]: status }));
            });

          } else if (parsed.type === "tracking") {
            arnoldMsg.text = parsed.arnold_says || raw;
            // Map field names to Notion and local state
            const fieldMap = { pasos: "steps", sueño: "sleep", agua: "water", peso: "weight" };
            const notionMap = { pasos: null, sueño: "Horas de sueño", agua: "Agua (L)", peso: "Peso (kg)" };
            const localField = fieldMap[parsed.field];
            if (localField === "steps") {
              setActivity((a) => ({ ...a, steps: parsed.value, stepsKcal: Math.round(parsed.value * 0.04) }));
            } else if (localField === "sleep") {
              setActivity((a) => ({ ...a, sleep: parsed.value }));
            } else if (localField === "water") {
              setActivity((a) => ({ ...a, water: parsed.value }));
            }
            // Sync to Notion if there's a matching field
            const notionField = notionMap[parsed.field];
            if (notionField) {
              syncTrackingToNotion(notionField, parsed.value);
            }

          } else if (parsed.type === "activity") {
            arnoldMsg.text = parsed.arnold_says || raw;
            const sportMap = { baseball: "baseball", padel: "padel", gym: "gym" };
            const sport = sportMap[parsed.sport];
            if (sport) {
              setActivity((a) => ({
                ...a,
                [sport]: a[sport] + parsed.hours,
                [sport + "Kcal"]: a[sport + "Kcal"] + parsed.estimated_kcal,
              }));
            }
          }
        }
      } catch (e) { /* not JSON, keep as text */ }

      setMessages((p) => [...p, arnoldMsg]);
    } catch (err) {
      setMessages((p) => [...p, { id: Date.now() + 2, from: "arnold", text: "🐙 Se me fue la señal del océano. ¡Inténtalo de nuevo!", time: timeStr() }]);
    }
    setLoading(false);
  }, [input, image, preview, messages]);

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  /* Daily totals */
  const daily = meals.reduce((a, m) => {
    const t = m.analysis?.totals;
    return t ? { cal: a.cal + t.calories, p: a.p + t.protein, c: a.c + t.carbs, f: a.f + t.fat } : a;
  }, { cal: 0, p: 0, c: 0, f: 0 });

  const totalBurn = TMB + activity.stepsKcal + activity.baseballKcal + activity.padelKcal + activity.gymKcal;
  const balance = daily.cal - totalBurn;
  const isDeficit = balance <= 0;

  return (
    <div className="app">
      <style>{css}</style>

      {/* Header */}
      <div className="header">
        <div className="header-avatar" style={{ backgroundImage: `url('${arnoldImg}')`, backgroundSize: "cover", backgroundPosition: "center", fontSize: 0 }}>
          Arnold
          <div className="header-dot" />
        </div>
        <div className="header-info">
          <h1>Arnold</h1>
          <p>Pulpo Fitness · {mood === "serious" ? "¡Necesitas mejorar!" : "¡Vas bien!"}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === "chat" ? "active" : ""}`} onClick={() => setTab("chat")}>
          💬 Chat
        </button>
        <button className={`tab ${tab === "dash" ? "active" : ""}`} onClick={() => setTab("dash")}>
          📊 Hoy
          {meals.length > 0 && <span className="tab-badge">{meals.length}</span>}
        </button>
      </div>

      {/* ─── CHAT TAB ─────────────────────────────────────────────────── */}
      {tab === "chat" && (
        <>
          <div className="chat-scroll">
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.from}`}>
                {m.from === "arnold" && <img src={arnoldImg} alt="Arnold" style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, objectFit: "cover" }} />}
                <div style={{ maxWidth: "78%" }}>
                  <div className={`bubble ${m.from}`}>
                    {m.preview && <img src={m.preview} alt="comida" />}
                    {m.text && <div>{m.text}</div>}
                    {m.analysis && <AnalysisCard data={m.analysis} />}
                  </div>
                  {m.analysis && (
                    <div className="notion-sync">
                      {syncStatus[m.mealId] === "syncing" ? "⏳ Sincronizando con Notion..." :
                       syncStatus[m.mealId] === "synced" ? "✓ Registrado en Notion" :
                       syncStatus[m.mealId] === "error" ? "⚠ Error al sincronizar" :
                       "✓ Registrado en Notion"}
                    </div>
                  )}
                  <div className="bubble-time">{m.time}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="typing">
                <img src={arnoldImg} alt="Arnold" style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, objectFit: "cover", animation: "pulpoBounce 0.8s ease infinite" }} />
                <div className="typing-dots">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {preview && (
            <div className="img-preview">
              <img src={preview} alt="" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>📸 Foto lista</div>
                <div style={{ fontSize: 12, color: T.textSecondary }}>Arnold la va a analizar</div>
              </div>
              <button className="img-preview-remove" onClick={clearImage}>✕</button>
            </div>
          )}

          <div className="input-bar">
            <button className={`btn-icon btn-cam ${preview ? "has-img" : ""}`} onClick={() => fileRef.current?.click()}>📸</button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Dile a Arnold qué comiste..."
              rows={1}
            />
            <button className="btn-icon btn-send" onClick={send} disabled={loading || (!input.trim() && !image)}>⚡</button>
          </div>
        </>
      )}

      {/* ─── DASHBOARD TAB ────────────────────────────────────────────── */}
      {tab === "dash" && (
        <div className="dash">
          {/* Calories */}
          <div className="card" style={{ textAlign: "center" }}>
            <div className="cal-label">Calorías consumidas</div>
            <div className="cal-number">
              {Math.round(daily.cal).toLocaleString()} <span>/ {GOALS.calories.toLocaleString()}</span>
            </div>
            <div className="cal-bar">
              <div
                className="cal-fill"
                style={{
                  width: `${Math.min((daily.cal / GOALS.calories) * 100, 100)}%`,
                  background: daily.cal > GOALS.calories 
                    ? `linear-gradient(90deg, ${T.red}, #DC2626)` 
                    : `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
                  color: daily.cal > GOALS.calories ? T.red : T.accent,
                }}
              />
            </div>
            <span
              className="deficit-pill"
              style={{
                background: isDeficit ? T.greenSoft : T.redSoft,
                color: isDeficit ? T.greenText : T.redText,
              }}
            >
              {isDeficit ? "📉" : "📈"} {isDeficit ? "Déficit" : "Superávit"}: {Math.abs(Math.round(balance)).toLocaleString()} kcal
            </span>
          </div>

          {/* Macros */}
          <div className="macros-grid">
            <div className="macro-card" style={{ background: T.greenSoft }}>
              <div className="macro-card-label" style={{ color: T.greenText }}>Proteína</div>
              <div className="macro-card-val" style={{ color: T.greenText }}>
                {Math.round(daily.p)}g <MacroArrow current={daily.p} goal={GOALS.protein} />
              </div>
              <div className="macro-card-meta" style={{ color: T.green }}>Meta: {GOALS.protein}g</div>
            </div>
            <div className="macro-card" style={{ background: T.blueSoft }}>
              <div className="macro-card-label" style={{ color: T.blueText }}>Carbos</div>
              <div className="macro-card-val" style={{ color: T.blueText }}>
                {Math.round(daily.c)}g <MacroArrow current={daily.c} goal={GOALS.carbs} />
              </div>
              <div className="macro-card-meta" style={{ color: T.blue }}>Meta: {GOALS.carbs}g</div>
            </div>
            <div className="macro-card" style={{ background: T.orangeSoft }}>
              <div className="macro-card-label" style={{ color: T.orangeText }}>Grasas</div>
              <div className="macro-card-val" style={{ color: T.orangeText }}>
                {Math.round(daily.f)}g <MacroArrow current={daily.f} goal={GOALS.fat} />
              </div>
              <div className="macro-card-meta" style={{ color: T.orange }}>Meta: {GOALS.fat}g</div>
            </div>
          </div>

          {/* Wellness */}
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: T.textPrimary }}>😴 Bienestar</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="act-item" style={{ opacity: activity.sleep ? 1 : 0.35 }}>
                <div className="act-item-icon">🌙</div>
                <div className="act-item-label">Sueño</div>
                <div className="act-item-val">{activity.sleep ? `${activity.sleep}h` : "--"}</div>
                <div className="act-item-sub">{activity.sleep >= 7 ? "Bien!" : activity.sleep > 0 ? "Poco" : "Sin datos"}</div>
              </div>
              <div className="act-item" style={{ opacity: activity.water ? 1 : 0.35 }}>
                <div className="act-item-icon">💧</div>
                <div className="act-item-label">Agua</div>
                <div className="act-item-val">{activity.water ? `${activity.water}L` : "--"}</div>
                <div className="act-item-sub">{activity.water >= 3 ? "Meta!" : activity.water > 0 ? `Faltan ${(3 - activity.water).toFixed(1)}L` : "Meta: 3L"}</div>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: T.textPrimary }}>🔥 Actividad de hoy</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>Registra tu actividad abajo</div>
            <div className="act-grid">
              <div className={`act-item ${activity.steps ? "" : "inactive"}`}>
                <div className="act-item-icon">🚶</div>
                <div className="act-item-label">Pasos</div>
                <div className="act-item-val">{activity.steps ? activity.steps.toLocaleString() : "--"}</div>
                <div className="act-item-sub">{activity.stepsKcal ? `~${activity.stepsKcal} kcal` : "Sin datos"}</div>
              </div>
              <div className={`act-item ${activity.baseballKcal ? "" : "inactive"}`}>
                <div className="act-item-icon">⚾</div>
                <div className="act-item-label">Béisbol</div>
                <div className="act-item-val">{activity.baseball ? `${activity.baseball}h` : "--"}</div>
                <div className="act-item-sub">{activity.baseballKcal ? `~${activity.baseballKcal} kcal` : "No hoy"}</div>
              </div>
              <div className={`act-item ${activity.padelKcal ? "" : "inactive"}`}>
                <div className="act-item-icon">🎾</div>
                <div className="act-item-label">Pádel</div>
                <div className="act-item-val">{activity.padel ? `${activity.padel}h` : "--"}</div>
                <div className="act-item-sub">{activity.padelKcal ? `~${activity.padelKcal} kcal` : "No hoy"}</div>
              </div>
              <div className={`act-item ${activity.gymKcal ? "" : "inactive"}`}>
                <div className="act-item-icon">🏋️</div>
                <div className="act-item-label">Gym</div>
                <div className="act-item-val">{activity.gym ? `${activity.gym}h` : "--"}</div>
                <div className="act-item-sub">{activity.gymKcal ? `~${activity.gymKcal} kcal` : "No hoy"}</div>
              </div>
            </div>

            {/* Quick activity buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {[
                { label: "⚾ +1.5h béisbol", fn: () => setActivity((a) => ({ ...a, baseball: a.baseball + 1.5, baseballKcal: a.baseballKcal + 420 })) },
                { label: "🎾 +1h pádel", fn: () => setActivity((a) => ({ ...a, padel: a.padel + 1, padelKcal: a.padelKcal + 380 })) },
                { label: "🏋️ +1h gym", fn: () => setActivity((a) => ({ ...a, gym: a.gym + 1, gymKcal: a.gymKcal + 300 })) },
                { label: "🚶 +5k pasos", fn: () => setActivity((a) => ({ ...a, steps: a.steps + 5000, stepsKcal: a.stepsKcal + 200 })) },
              ].map((b, i) => (
                <button
                  key={i}
                  onClick={b.fn}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 20,
                    border: `1px solid ${T.borderLight}`,
                    background: T.bgSurface,
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    fontWeight: 500,
                    color: T.textSecondary,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => { e.target.style.borderColor = T.accent + '60'; e.target.style.color = T.accentLight; }}
                  onMouseLeave={(e) => { e.target.style.borderColor = T.borderLight; e.target.style.color = T.textSecondary; }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Balance */}
          <div className="balance">
            <div className="balance-row">TMB: ~{TMB.toLocaleString()} kcal</div>
            {activity.stepsKcal > 0 && <div className="balance-row">Pasos: ~{activity.stepsKcal} kcal</div>}
            {activity.baseballKcal > 0 && <div className="balance-row">Béisbol: ~{activity.baseballKcal} kcal</div>}
            {activity.padelKcal > 0 && <div className="balance-row">Pádel: ~{activity.padelKcal} kcal</div>}
            {activity.gymKcal > 0 && <div className="balance-row">Gym: ~{activity.gymKcal} kcal</div>}
            <div className="balance-total">Gasto total estimado: ~{totalBurn.toLocaleString()} kcal</div>
            <div className="balance-result" style={{ color: isDeficit ? T.greenText : T.redText }}>
              {isDeficit ? "📉" : "📈"} {isDeficit ? "Déficit" : "Superávit"} neto: ~{Math.abs(Math.round(balance)).toLocaleString()} kcal
            </div>
          </div>

          {/* Meals log */}
          {meals.length > 0 && (
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: T.textPrimary }}>🍽️ Comidas registradas hoy</div>
              {meals.map((m, i) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < meals.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{m.analysis.meal_name}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>P:{m.analysis.totals.protein}g · C:{m.analysis.totals.carbs}g · G:{m.analysis.totals.fat}g</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.accentLight, letterSpacing: "-0.5px" }}>{m.analysis.totals.calories}</div>
                </div>
              ))}
            </div>
          )}

          {meals.length === 0 && (
            <div className="empty">
              <img src="/arnold-full.png" alt="Arnold" style={{ width: 120, height: 120, objectFit: "contain", marginBottom: 12 }} />
              <p style={{ fontWeight: 600, color: T.textSecondary }}>No hay comidas registradas</p>
              <p>Ve al chat y mándame una foto de tu comida</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
