import "dotenv/config";
import { subDays, setHours, setMinutes, addMinutes } from "date-fns";
import { db, schema } from "./index";
import type { ActivityType } from "./schema";

const {
  farms,
  users,
  fields,
  products,
  logs,
  logApplications,
  tags,
  logTags,
  auditEvents,
  messages,
} = schema;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic PRNG so the seed is stable across runs. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fake but plausible waveform peaks for logs that have no audio file. */
function makePeaks(seed: number, n = 96): number[] {
  const rnd = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    // envelope: speech bursts with pauses
    const burst = Math.sin(i / 7) * 0.5 + 0.5;
    const v = (0.15 + burst * 0.85) * (0.4 + rnd() * 0.6);
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

function at(day: Date, h: number, m: number) {
  return setMinutes(setHours(day, h), m);
}

/** Axis-aligned polygon (lng/lat) around a centre with given size in degrees. */
function rect(lat: number, lng: number, dLat: number, dLng: number): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding…");

  // Wipe. Everything cascades from farms.
  await db.delete(farms);

  const [farm] = await db.insert(farms).values({ name: "Bays Ranch" }).returning();

  // --- Users --------------------------------------------------------------
  const workerNames: [string, string][] = [
    ["Isaac Wang", "en"],
    ["Maya Patel", "en"],
    ["Liam Johnson", "en"],
    ["Sophia Lee", "en"],
    ["Carlos Mendoza", "es"],
    ["Aiko Tanaka", "ja"],
    ["Priya Sharma", "hi"],
    ["Diego Ramirez", "es"],
    ["Emma Schmidt", "de"],
    ["Noah Williams", "en"],
    ["Fatima Hassan", "en"],
    ["Lucas Oliveira", "pt"],
  ];

  const [admin] = await db
    .insert(users)
    .values({ farmId: farm.id, name: "Bays Ranch", role: "admin", preferredLanguage: "en" })
    .returning();

  const workers = await db
    .insert(users)
    .values(
      workerNames.map(([name, preferredLanguage]) => ({
        farmId: farm.id,
        name,
        role: "worker" as const,
        preferredLanguage,
      })),
    )
    .returning();
  const w = Object.fromEntries(workers.map((u) => [u.name, u]));

  // --- Fields (central Iowa farmland) ---------------------------------------
  const base = { lat: 41.9615, lng: -93.7025 };
  const fieldRows = await db
    .insert(fields)
    .values([
      { code: "FIELD A", name: "North 40", lat: base.lat + 0.006, lng: base.lng - 0.008, acres: "38.5" },
      { code: "FIELD B", name: "Creek Bottom", lat: base.lat + 0.006, lng: base.lng + 0.004, acres: "52.0" },
      { code: "FIELD C", name: "South Quarter", lat: base.lat - 0.005, lng: base.lng - 0.008, acres: "41.2" },
      { code: "FIELD D", name: "Home Place", lat: base.lat - 0.005, lng: base.lng + 0.004, acres: "29.8" },
    ].map((f) => ({
      farmId: farm.id,
      code: f.code,
      name: f.name,
      acres: f.acres,
      geometry: rect(f.lat, f.lng, 0.0042, 0.0052),
      centroidLat: f.lat.toFixed(6),
      centroidLng: f.lng.toFixed(6),
    })))
    .returning();
  const f = Object.fromEntries(fieldRows.map((x) => [x.code, x]));

  // --- Products -------------------------------------------------------------
  const productRows = await db
    .insert(products)
    .values([
      { name: "Roundup PowerMax", type: "herbicide", activeIngredient: "glyphosate", reiHours: 4, aliases: ["Roundup", "glyphosate", "PowerMax"] },
      { name: "Atrazine 4L", type: "herbicide", activeIngredient: "atrazine", reiHours: 12, aliases: ["atrazine", "AAtrex"] },
      { name: "2,4-D Amine", type: "herbicide", activeIngredient: "2,4-D", reiHours: 48, aliases: ["2,4-D", "two four D", "24D"] },
      { name: "Urea 46-0-0", type: "fertilizer", activeIngredient: "urea", reiHours: 0, aliases: ["urea", "46-0-0"] },
      { name: "Anhydrous Ammonia", type: "fertilizer", activeIngredient: "ammonia", reiHours: 0, aliases: ["anhydrous", "NH3"] },
      { name: "Lorsban Advanced", type: "insecticide", activeIngredient: "chlorpyrifos", reiHours: 24, aliases: ["Lorsban", "chlorpyrifos"] },
      { name: "Headline", type: "fungicide", activeIngredient: "pyraclostrobin", reiHours: 12, aliases: ["Headline", "pyraclostrobin"] },
      { name: "Warrior II", type: "insecticide", activeIngredient: "lambda-cyhalothrin", reiHours: 24, aliases: ["Warrior", "lambda"] },
    ].map((p) => ({ ...p, farmId: farm.id, type: p.type as "herbicide" | "fertilizer" | "insecticide" | "fungicide" })))
    .returning();
  const p = Object.fromEntries(productRows.map((x) => [x.name, x]));

  // --- Tags -----------------------------------------------------------------
  const tagRows = await db
    .insert(tags)
    .values([
      { farmId: farm.id, name: "Needs follow-up", color: "#fee2e2" },
      { farmId: farm.id, name: "Compliance", color: "#dbeafe" },
      { farmId: farm.id, name: "Weather delay", color: "#fef3c7" },
    ])
    .returning();

  // --- Logs -----------------------------------------------------------------
  const today = new Date();

  type SeedLog = {
    worker: string;
    field: string;
    activity: ActivityType;
    day: Date;
    start: [number, number];
    end: [number, number];
    status: "new" | "reviewed" | "flagged";
    source?: "online" | "offline";
    lang?: string;
    transcriptRaw: string;
    transcriptEn?: string;
    summary: string;
    confidence: number;
    needsReview?: boolean;
    reviewReason?: string;
    applications?: { product: string; rate?: string; unit?: string }[];
    tags?: string[];
  };

  const seedLogs: SeedLog[] = [
    // ---- The four rows from the design (all "new", all today) -------------
    {
      worker: "Isaac Wang",
      field: "FIELD A",
      activity: "spraying",
      day: today,
      start: [6, 0],
      end: [10, 40],
      status: "new",
      source: "offline",
      lang: "en",
      transcriptRaw:
        "Offline guided voice log created at 2026-04-08T22:01:01.711Z. Question (activity_type): What type of activity was this — spraying, fertilizing, planting, irrigating, harvesting, scouting, pruning, soil work, or equipment maintenance? Answer: I'm leaving first, I'm going to go home. Question (field_block): Where were you working (field, block, or area)? Answer: yes, in one part and then 130 and 200 yes, and 130 for uh 160 and no, this yes no, no, uhm no no I remember, uhm uhm uhm, no, I don't remember anything.",
      summary:
        "Guided log recorded offline. Worker's answers did not address the activity or field questions; activity and field were inferred from schedule context and should be confirmed.",
      confidence: 0.31,
      needsReview: true,
      reviewReason: "Answers were off-topic — field and product not stated. Activity/field inferred from the day's schedule.",
      applications: [{ product: "Roundup PowerMax", rate: "32", unit: "oz/ac" }],
      tags: ["Needs follow-up"],
    },
    {
      worker: "Maya Patel",
      field: "FIELD B",
      activity: "harvesting",
      day: today,
      start: [7, 30],
      end: [11, 15],
      status: "new",
      lang: "en",
      transcriptRaw:
        "Started combining the creek bottom at seven thirty. Moisture was reading about eighteen percent so a little wet but we pushed through. Got maybe two thirds of the field done before we broke for lunch at eleven fifteen. No issues with the machine.",
      summary: "Harvested roughly two-thirds of Field B (corn) between 7:30 and 11:15. Grain moisture ~18%. No equipment issues.",
      confidence: 0.94,
    },
    {
      worker: "Liam Johnson",
      field: "FIELD C",
      activity: "planting",
      day: today,
      start: [8, 0],
      end: [12, 0],
      status: "new",
      lang: "en",
      transcriptRaw:
        "Planting soybeans on the south quarter, eight to noon. Running thirty inch rows, population set at one forty thousand. Ground conditions were good, a little crusty on the east edge.",
      summary: "Planted soybeans on Field C from 8:00 to 12:00. 30-inch rows at 140k population. Slight crusting on the east edge.",
      confidence: 0.97,
    },
    {
      worker: "Sophia Lee",
      field: "FIELD D",
      activity: "irrigating",
      day: today,
      start: [6, 30],
      end: [9, 30],
      status: "new",
      lang: "en",
      transcriptRaw:
        "Ran the pivot on the home place from six thirty to nine thirty, about three quarters of an inch. Nozzle on tower four is still dripping, someone should look at it.",
      summary: "Irrigated Field D via center pivot, 6:30–9:30, ~0.75 in applied. Tower 4 nozzle is leaking and needs maintenance.",
      confidence: 0.92,
      tags: ["Needs follow-up"],
    },

    // ---- A fifth log today, already reviewed --------------------------------
    {
      worker: "Carlos Mendoza",
      field: "FIELD B",
      activity: "scouting",
      day: today,
      start: [13, 0],
      end: [14, 10],
      status: "reviewed",
      lang: "es",
      transcriptRaw:
        "Revisé el campo B después del almuerzo. Vi algo de pulgón en la esquina noreste, no mucho todavía, pero hay que vigilarlo. El resto del campo se ve bien.",
      transcriptEn:
        "I checked Field B after lunch. Saw some aphids in the northeast corner, not much yet, but it needs watching. The rest of the field looks good.",
      summary: "Scouted Field B, 1:00–2:10 PM. Light aphid pressure in the NE corner; monitor. Rest of field healthy.",
      confidence: 0.9,
      tags: ["Compliance"],
    },
  ];

  // ---- Historical logs over the last 30 days -----------------------------
  const rnd = mulberry32(42);
  const activities: ActivityType[] = ["spraying", "fertilizing", "scouting", "irrigating", "soil_work", "equipment_maintenance", "planting", "pruning"];
  const fieldCodes = ["FIELD A", "FIELD B", "FIELD C", "FIELD D"];
  const sprayProducts = ["Roundup PowerMax", "Atrazine 4L", "2,4-D Amine", "Lorsban Advanced", "Headline", "Warrior II"];
  const fertProducts = ["Urea 46-0-0", "Anhydrous Ammonia"];

  const historicalTemplates: Record<string, (field: string, prod?: string) => { raw: string; summary: string }> = {
    spraying: (field, prod) => ({
      raw: `Sprayed ${prod} on ${field.toLowerCase()} this morning, went on clean, wind was under eight miles an hour. Full rate, no skips.`,
      summary: `Applied ${prod} to ${field} at label rate. Wind <8 mph, no skips.`,
    }),
    fertilizing: (field, prod) => ({
      raw: `Put ${prod} down on ${field.toLowerCase()}. Spreader calibrated yesterday so should be right on.`,
      summary: `Applied ${prod} to ${field}. Spreader recently calibrated.`,
    }),
    scouting: (field) => ({
      raw: `Walked ${field.toLowerCase()}, stand looks even, a few volunteer corn plants along the fence line. No disease pressure yet.`,
      summary: `Scouted ${field}. Even stand, minor volunteer corn on the fence line, no disease.`,
    }),
    irrigating: (field) => ({
      raw: `Pivot ran on ${field.toLowerCase()} overnight, about an inch. Pressure held steady.`,
      summary: `Irrigated ${field}, ~1 in applied. Pressure steady.`,
    }),
    soil_work: (field) => ({
      raw: `Ran the field cultivator over ${field.toLowerCase()}, got it worked down nice. A few wet spots on the low end.`,
      summary: `Tillage on ${field} with field cultivator. Wet spots on the low end.`,
    }),
    equipment_maintenance: (field) => ({
      raw: `Changed the oil on the sprayer and replaced two nozzles before heading out to ${field.toLowerCase()}.`,
      summary: `Sprayer maintenance: oil change, two nozzles replaced. Staged at ${field}.`,
    }),
    planting: (field) => ({
      raw: `Planted corn on ${field.toLowerCase()}, thirty four thousand population, planter did fine.`,
      summary: `Planted corn on ${field} at 34k population. No planter issues.`,
    }),
    pruning: (field) => ({
      raw: `Trimmed back the windbreak along ${field.toLowerCase()}, hauled the brush to the pile.`,
      summary: `Pruned windbreak along ${field}; brush hauled.`,
    }),
  };

  for (let i = 0; i < 34; i++) {
    const worker = workerNames[Math.floor(rnd() * workerNames.length)][0];
    const field = fieldCodes[Math.floor(rnd() * fieldCodes.length)];
    const activity = activities[Math.floor(rnd() * activities.length)];
    const daysAgo = 1 + Math.floor(rnd() * 29);
    const day = subDays(today, daysAgo);
    const startH = 6 + Math.floor(rnd() * 8);
    const durMin = 60 + Math.floor(rnd() * 240);
    const end = addMinutes(at(day, startH, 0), durMin);
    const prod =
      activity === "spraying"
        ? sprayProducts[Math.floor(rnd() * sprayProducts.length)]
        : activity === "fertilizing"
          ? fertProducts[Math.floor(rnd() * fertProducts.length)]
          : undefined;
    const t = historicalTemplates[activity](field, prod);
    const confidence = Math.round((0.78 + rnd() * 0.2) * 100) / 100;
    seedLogs.push({
      worker,
      field,
      activity,
      day,
      start: [startH, 0],
      end: [end.getHours(), end.getMinutes()],
      status: rnd() < 0.85 ? "reviewed" : "new",
      lang: "en",
      transcriptRaw: t.raw,
      summary: t.summary,
      confidence,
      applications: prod ? [{ product: prod, rate: activity === "spraying" ? "32" : "150", unit: activity === "spraying" ? "oz/ac" : "lb/ac" }] : undefined,
    });
  }

  // Insert logs
  let seedIdx = 1;
  for (const s of seedLogs) {
    const startedAt = at(s.day, s.start[0], s.start[1]);
    const endedAt = at(s.day, s.end[0], s.end[1]);
    const [log] = await db
      .insert(logs)
      .values({
        farmId: farm.id,
        workerId: w[s.worker].id,
        fieldId: f[s.field].id,
        activityType: s.activity,
        status: s.needsReview ? "flagged" : s.status,
        source: s.source ?? "online",
        startedAt,
        endedAt,
        languageDetected: s.lang ?? "en",
        transcriptRaw: s.transcriptRaw,
        transcriptEn: s.transcriptEn ?? (s.lang === "en" || !s.lang ? s.transcriptRaw : null),
        summary: s.summary,
        durationS: (20 + Math.floor(mulberry32(seedIdx)() * 70)).toFixed(2),
        peaks: makePeaks(seedIdx),
        confidence: s.confidence.toFixed(2),
        needsReview: s.needsReview ?? false,
        reviewReason: s.reviewReason ?? null,
        createdAt: endedAt, // recorded when the job ended
        syncedAt: s.source === "offline" ? addMinutes(endedAt, 95) : endedAt,
        extraction: {
          activity_type: s.activity,
          field_code: s.field,
          confidence: s.confidence,
        },
      })
      .returning();
    seedIdx++;

    if (s.applications?.length) {
      await db.insert(logApplications).values(
        s.applications.map((a) => ({
          logId: log.id,
          productId: p[a.product]?.id ?? null,
          productName: a.product,
          rate: a.rate ?? null,
          unit: a.unit ?? null,
        })),
      );
    }

    if (s.tags?.length) {
      await db.insert(logTags).values(
        s.tags.map((name) => ({
          logId: log.id,
          tagId: tagRows.find((t) => t.name === name)!.id,
        })),
      );
    }

    await db.insert(auditEvents).values({
      logId: log.id,
      userId: w[s.worker].id,
      action: "created",
      diff: { source: s.source ?? "online" },
      createdAt: endedAt,
    });
    if (s.status === "reviewed") {
      await db.insert(auditEvents).values({
        logId: log.id,
        userId: admin.id,
        action: "reviewed",
        createdAt: addMinutes(endedAt, 240),
      });
    }
  }

  // --- Messages (office ↔ crew, stored in both languages) ------------------
  const carlos = w["Carlos Mendoza"];
  const lucas = w["Lucas Oliveira"];
  await db.insert(messages).values([
    {
      farmId: farm.id, workerId: carlos.id, sender: "admin",
      bodyOriginal: "Morning Carlos — Field B is under a 12-hour re-entry interval after yesterday's atrazine. Please stay out until 6 PM.",
      languageOriginal: "en",
      bodyTranslated: "Buenos días Carlos — el campo B tiene un intervalo de reingreso de 12 horas después de la atrazina de ayer. Por favor no entres hasta las 6 PM.",
      languageTranslated: "es",
      createdAt: subDays(today, 1),
    },
    {
      farmId: farm.id, workerId: carlos.id, sender: "worker",
      bodyOriginal: "Entendido. Voy a trabajar en el campo D mientras tanto. ¿Hay que revisar el pivote de la torre cuatro?",
      languageOriginal: "es",
      bodyTranslated: "Understood. I'll work on Field D in the meantime. Does the tower four pivot need checking?",
      languageTranslated: "en",
      createdAt: addMinutes(subDays(today, 1), 25),
    },
    {
      farmId: farm.id, workerId: lucas.id, sender: "admin",
      bodyOriginal: "Lucas, great scouting notes this week. Can you check the north edge of Field A for aphids tomorrow?",
      languageOriginal: "en",
      bodyTranslated: "Lucas, ótimas anotações de monitoramento esta semana. Você pode verificar a borda norte do campo A em busca de pulgões amanhã?",
      languageTranslated: "pt",
      createdAt: subDays(today, 2),
    },
  ]);

  console.log(`Seeded ${seedLogs.length} logs, ${workers.length} workers, ${fieldRows.length} fields, ${productRows.length} products.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
