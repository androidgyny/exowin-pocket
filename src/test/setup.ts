import { vi } from "vitest";

// Mock the Tauri core API so stores can be tested without a running Tauri process.
// Tests override invoke per-case via vi.mocked(invoke).mockResolvedValue(...)
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  // Components turn absolute paths into asset:// URLs; in jsdom the identity
  // is enough for smoke tests that assert on what got rendered.
  convertFileSrc: (p: string) => `asset://${p}`,
}));
