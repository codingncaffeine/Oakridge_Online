const SETTINGS_KEY = "oakridge.settings";

export interface Settings {
  cameraSpeed: number;
  brightness: number;
}

const DEFAULTS: Settings = { cameraSpeed: 1, brightness: 1 };

/** The side panel: a row of tabs, each opening its page. Clicking the open tab closes the panel again. */
export class SidePanel {
  onSettings: (s: Settings) => void = () => {};
  settings: Settings = { ...DEFAULTS };
  private readonly tabs = [...document.querySelectorAll<HTMLButtonElement>(".panel-tab")];
  private readonly bodies = [...document.querySelectorAll<HTMLElement>(".panel-body")];

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
  }

  private current(): string | null {
    return this.tabs.find((t) => t.getAttribute("aria-selected") === "true")?.dataset.tab ?? null;
  }

  open(tab: string | null): void {
    for (const t of this.tabs) t.setAttribute("aria-selected", String(t.dataset.tab === tab));
    for (const b of this.bodies) b.hidden = b.dataset.body !== tab;
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Not stored this visit.
    }
  }
}
