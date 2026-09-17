import { analyzeCraftWithGemini, type CraftAnalysisRequest } from "../../src/server/gemini";

// Helper to reliably parse body from Vercel-parsed req.body or raw stream (Vite dev server)
async function parseRequestBody(req: any): Promise<CraftAnalysisRequest> {
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        throw new Error("Invalid JSON in request body");
      }
    }
    if (typeof req.body === "object") {
      return req.body;
    }
  }

  // If body parser didn't run (e.g. Node IncomingMessage in Vite dev server)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: any) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (!raw.trim()) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON payload"));
      }
    });
    req.on("error", (err: any) => reject(err));
  });
}

// Helper to send response whether running in Vercel Serverless environment or Vite dev middleware
function sendJson(res: any, status: number, data: any) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(data);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

// Vercel Serverless Function for POST /api/gemini/analyze-craft
export default async function handler(req: any, res: any) {
  // CORS Configuration
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    if (typeof res.status === "function" && typeof res.end === "function") {
      return res.status(200).end();
    }
    res.statusCode = 200;
    return res.end();
  }

  // Enforce POST requests only
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      error: "Method not allowed. Only POST requests are accepted.",
    });
  }

  // Check GEMINI_API_KEY environment variable exclusively from process.env.GEMINI_API_KEY
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    console.error("Missing GEMINI_API_KEY in server environment.");
    return sendJson(res, 500, {
      error: "GEMINI_API_KEY environment variable is not configured on the server.",
    });
  }

  // Parse and validate payload
  let payload: CraftAnalysisRequest;
  try {
    payload = await parseRequestBody(req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Malformed request payload";
    return sendJson(res, 400, { error: msg });
  }

  // Basic validation: ensure payload exists and contains at least imageBase64 or voiceHint
  if (!payload || (!payload.imageBase64 && !payload.voiceHint)) {
    return sendJson(res, 400, {
      error: "Invalid request. Please provide an image (imageBase64) or artisan description (voiceHint).",
    });
  }

  try {
    const result = await analyzeCraftWithGemini(payload);
    return sendJson(res, 200, result);
  } catch (err: unknown) {
    console.error("Gemini craft analysis error:", err);
    const errorMessage = err instanceof Error ? err.message : "Craft analysis failed";
    return sendJson(res, 500, { error: errorMessage });
  }
}
