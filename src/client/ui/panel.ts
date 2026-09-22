const SETTINGS_KEY = "oakridge.settings";

export interface Settings {
  cameraSpeed: number;
  brightness: number;
  /** Volume (0–1) of your own actions, of what happens around you, and of the music. */
  effects: number;
  area: number;
  music: number;
}

const DEFAULTS: Settings = { cameraSpeed: 1, brightness: 1, effects: 0.6, area: 0.6, music: 0.3 };

/**
 * The side panel: a row of tabs above its page and another below, as in the classic layout. A tab
 * opens its page; clicking the open tab again folds the page away (the tabs stay).
 */
export class SidePanel {
  onSettings: (s: Settings) => void = () => {};
  settings: Settings = { ...DEFAULTS };
  private readonly tabs = [...document.querySelectorAll<HTMLButtonElement>(".side-tab")];
  private readonly pages = [...document.querySelectorAll<HTMLElement>(".side-page")];
  private readonly body = document.getElementById("side-body") as HTMLElement;

  constructor() {
    try {
      this.settings = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>) };
    } catch {
      // Stored settings are a convenience; defaults are fine.
    }
    for (const tab of this.tabs) tab.addEventListener("click", () => this.open(tab.dataset.tab === this.current() ? null : tab.dataset.tab!));
    const bind = (id: string, key: keyof Settings) => {
      const input = document.getElementById(id) as HTMLInputElement;
      input.value = String(this.settings[key]);
      input.addEventListener("input", () => {
        this.settings[key] = Number(input.value);
        this.save();
        this.onSettings(this.settings);
      });
    };
    bind("set-camera", "cameraSpeed");
    bind("set-bright", "brightness");
    bind("set-music", "music");
    bind("set-effects", "effects");
    bind("set-area", "area");
  }

  current(): string | null {
    return this.tabs.find((t) => t.getAttribute("aria-selected") === "true")?.dataset.tab ?? null;
  }

  open(tab: string | null): void {
    for (const t of this.tabs) t.setAttribute("aria-selected", String(t.dataset.tab === tab));
    for (const p of this.pages) p.hidden = p.dataset.page !== tab;
    this.body.hidden = tab === null;
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Not stored this visit.
    }
  }
}
