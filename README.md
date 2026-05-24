# 🐙 Arnold — Pulpo Fitness Agent

Arnold es un agente de fitness y nutrición personal con personalidad intensa y motivadora. Es un pulpo musculoso con gorra y hoodie azul del Clan de los Pulpos.

## Features

- **💬 Chat con Arnold** — Conversación con personalidad (motivador, directo, sin excusas)
- **📸 Análisis de fotos de comida** — Sube una foto y Arnold identifica ingredientes, estima macros y da tips personalizados
- **📊 Dashboard diario** — Calorías vs meta, macros con flechas de progreso, indicador de déficit/superávit
- **🔄 Sincronización con Notion** — Cada comida y tracking se registra automáticamente (acumulativo)
- **😴 Tracking de bienestar** — Sueño, agua, pasos y actividad física
- **⚾🎾🏋️ Actividad deportiva** — Béisbol, Pádel, Gym con estimación de calorías quemadas
- **📅 Mediciones semanales** — Arnold te pide peso y medidas los lunes

## Stack

- **Frontend:** React 18 + Vite
- **AI:** Claude API (Sonnet 4) con vision para análisis de fotos
- **Backend/DB:** Notion (via MCP) como base de datos
- **Deploy:** Vercel (auto-deploy desde GitHub)
- **Diseño:** Dark glassmorphism con paleta inspirada en Arnold (terracotta + azul marino)

## Notion Databases

| Base de datos | Propósito |
|---|---|
| 📅 Registro Diario | Calorías, macros, peso, sueño, agua por día |
| 🍽️ Mis Comidas & Alimentos | Librería de alimentos con macros |
| 💪 Mis Entrenamientos | Registro de ejercicios y actividad |

## Setup Local

```bash
npm install
npm run dev
```

## Environment

La app usa la API de Claude directamente desde el frontend (artifact pattern). Para producción, se recomienda mover las API calls a un endpoint serverless en Vercel (`/api/`).

## Personalización

El perfil del usuario está en el system prompt de `ArnoldApp.jsx`. Modificar:
- Datos corporales y metas
- Lesiones activas
- Restricciones alimentarias
- Deportes y actividades

---

*El Clan de los Pulpos* 🐙💪
