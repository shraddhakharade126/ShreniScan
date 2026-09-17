import { openDB, type IDBPDatabase } from "idb";
import type { CraftAnalysisResponse } from "@/server/gemini";
import type { StudioOptions } from "./studio-engine";
import { products as initialProducts, type Product } from "./kalakart-data";

export interface ProductDraft {
  id: string;
  step: number;
  rawImage: string;
  studioImage?: string;
  studioOptions?: StudioOptions;
  voiceNotes?: string;
  analysis?: CraftAnalysisResponse | null;
  finalPrice?: number;
  updatedAt: string;
  title?: string;
}

const DB_NAME = "kalakart_offline_db";
const DB_VERSION = 1;
const DRAFT_STORE = "product_drafts";
const CATALOG_STORE = "bazaar_catalog";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(DRAFT_STORE)) {
          db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CATALOG_STORE)) {
          db.createObjectStore(CATALOG_STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

const LOCAL_DRAFT_KEY = "kalakart_current_wizard_draft";
const LOCAL_DRAFTS_LIST = "kalakart_all_saved_drafts";
const LOCAL_CATALOG_KEY = "kalakart_active_catalog";

/**
 * Save current wizard state as a draft (both IndexedDB and localStorage).
 */
export async function saveDraft(draft: ProductDraft): Promise<void> {
  try {
    const db = await getDB();
    await db.put(DRAFT_STORE, draft);
  } catch (err) {
    console.warn("IndexedDB put failed, using localStorage fallback", err);
  }

  // Backup to localStorage for quick restore
  try {
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft));
    const all = getLocalDrafts();
    const existingIdx = all.findIndex((d) => d.id === draft.id);
    if (existingIdx >= 0) {
      all[existingIdx] = draft;
    } else {
      all.unshift(draft);
    }
    localStorage.setItem(LOCAL_DRAFTS_LIST, JSON.stringify(all.slice(0, 10)));
  } catch {
    // Ignore storage quota exceeded for huge base64
  }
}

/**
 * Retrieve all saved drafts
 */
export async function getAllDrafts(): Promise<ProductDraft[]> {
  try {
    const db = await getDB();
    const fromDB = await db.getAll(DRAFT_STORE);
    if (fromDB && fromDB.length > 0) {
      return fromDB.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  } catch (err) {
    console.warn("IndexedDB getAll failed", err);
  }
  return getLocalDrafts();
}

function getLocalDrafts(): ProductDraft[] {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFTS_LIST);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getCurrentWizardDraft(): ProductDraft | null {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(DRAFT_STORE, id);
  } catch {
    /* ignore */
  }

  try {
    const drafts = getLocalDrafts().filter((d) => d.id !== id);
    localStorage.setItem(LOCAL_DRAFTS_LIST, JSON.stringify(drafts));
    const current = getCurrentWizardDraft();
    if (current?.id === id) {
      localStorage.removeItem(LOCAL_DRAFT_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearCurrentWizardDraft() {
  try {
    localStorage.removeItem(LOCAL_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Active Bazaar Catalog products (merges seed products with artisan's newly published products)
 */
export async function getActiveCatalog(): Promise<Product[]> {
  try {
    const db = await getDB();
    const stored = await db.getAll(CATALOG_STORE);
    if (stored && stored.length > 0) {
      return stored.sort((a, b) => (b.id.localeCompare(a.id)));
    }
  } catch {
    /* ignore */
  }

  try {
    const raw = localStorage.getItem(LOCAL_CATALOG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }

  return initialProducts;
}

export async function publishProductToCatalog(product: Product): Promise<void> {
  const current = await getActiveCatalog();
  const updated = [product, ...current.filter((p) => p.id !== product.id)];

  try {
    const db = await getDB();
    await db.put(CATALOG_STORE, product);
  } catch {
    /* ignore */
  }

  try {
    localStorage.setItem(LOCAL_CATALOG_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
}
