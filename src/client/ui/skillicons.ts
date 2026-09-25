import type { SkillKey } from "../../shared/skills.ts";

// Skill pictures, drawn as small SVGs (24×24): a sword, a fist, a shield, a heart, a hatchet, a pick and
// a fish. They label the skills tab and ride along with XP drops.
export const SKILL_ICONS: Record<SkillKey, string> = {
  attack: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#c9ced6" d="M13.4 2.2 17 3.1l-7.1 12.2-2.6-1.5Z"/>
    <path fill="#8d939b" d="m13.4 2.2 1.8.5-6.2 11.8-1.7-.7Z"/>
    <path fill="#6b4423" d="m6.4 15.3 4.1 2.4-1.1 1.9-4.1-2.4Z"/>
    <path fill="#c8a040" d="M4.4 17.4 8 19.5l-1 1.7-3.6-2.1Z"/>
  </svg>`,
  strength: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#c47a4a" d="M6.6 9.2c0-1.5 1.2-2.6 2.7-2.6h4.9c2.6 0 4.7 2 4.7 4.6v2.4c0 2.6-2.1 4.6-4.7 4.6H9.3c-1.5 0-2.7-1.2-2.7-2.6Z"/>
    <path fill="#9c5c34" d="M6.6 12.8h12.3v1.9c0 2.5-2.1 4.5-4.7 4.5H9.3c-1.5 0-2.7-1.1-2.7-2.6Z"/>
    <path fill="#e0e4ea" d="M3.2 10.4h4.1v4.6H3.2z"/>
    <path fill="#a9aeb6" d="M3.2 12.8h4.1v2.2H3.2z"/>
  </svg>`,
  defence: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#9aa2ac" d="M12 2.2 20 5v7.2c0 4.3-3.2 7.9-8 9.6-4.8-1.7-8-5.3-8-9.6V5Z"/>
    <path fill="#6f7782" d="M12 2.2 20 5v7.2c0 4.3-3.2 7.9-8 9.6Z"/>
    <path fill="#c8a040" d="M12 6.1 16.4 7.6v4.3c0 2.4-1.8 4.4-4.4 5.4-2.6-1-4.4-3-4.4-5.4V7.6Z"/>
  </svg>`,
  hitpoints: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#c4302a" d="M12 21C6.8 17.5 3 14.3 3 10.3 3 7.4 5.2 5.2 8 5.2c1.7 0 3.1.8 4 2.1.9-1.3 2.3-2.1 4-2.1 2.8 0 5 2.2 5 5.1 0 4-3.8 7.2-9 10.7Z"/>
    <path fill="#e2635c" d="M8 7c-1.7 0-3 1.4-3 3.2 0 .7.2 1.4.5 2C4.8 11 5.9 7.7 8 7Z"/>
    <path fill="#8d1f1b" d="M12 21c5.2-3.5 9-6.7 9-10.7 0-1.6-.7-3-1.8-4 .3.7.5 1.5.5 2.3 0 3.9-3.5 7-7.7 10.4Z"/>
  </svg>`,
  woodcutting: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 20.5 16.2 7" stroke="#6b4423" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M5 20.5 16.2 7" stroke="#9a6a3a" stroke-width="1.1" stroke-linecap="round"/>
    <path fill="#c9ced6" d="M12.8 5.6 16.9 2c2.5.3 4.8 2.4 5.2 5l-3.8 3.4Z"/>
    <path fill="#80868e" d="m12.8 5.6 5.5 4.8-1.4 1.3-5.5-4.8Z"/>
  </svg>`,
  mining: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 21 16.4 6.6" stroke="#6b4423" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M6 21 16.4 6.6" stroke="#9a6a3a" stroke-width="1.1" stroke-linecap="round"/>
    <path fill="none" stroke="#b9bfc7" stroke-width="2.6" stroke-linecap="round" d="M8.6 3.9c4.4-1.9 9.6-.7 12.7 3.3"/>
    <path fill="none" stroke="#7d838b" stroke-width="1" stroke-linecap="round" d="M9.4 5.2c3.9-1.4 8.2-.4 10.8 2.8"/>
  </svg>`,
  fishing: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#6f98bd" d="M16.2 12 22 7.2v9.6Z"/>
    <ellipse cx="10.2" cy="12" rx="7.6" ry="4.3" fill="#9cc2e0"/>
    <path fill="#6f98bd" d="M8.4 8.1c1.3-1.9 3.3-2.6 5.2-2.2-.7 1.1-1.1 2-1.2 3Z"/>
    <path fill="none" stroke="#5f86a9" stroke-width=".9" d="M6.6 9.4c.9 1.5.9 3.7 0 5.2"/>
    <circle cx="5" cy="11.2" r="1" fill="#10202c"/>
  </svg>`,
  // Phase 8: a flame, a pot, a hammer, a needle and thread, and a flight of arrows.
  firemaking: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#d8481c" d="M12 2.4c3 3.4 6.4 6 6.4 10.2A6.4 6.4 0 0 1 12 19a6.4 6.4 0 0 1-6.4-6.4C5.6 8.4 9 5.8 12 2.4Z"/>
    <path fill="#f0a028" d="M12 8.6c1.7 2 3.3 3.3 3.3 5.4A3.3 3.3 0 0 1 12 17.3a3.3 3.3 0 0 1-3.3-3.3c0-2.1 1.6-3.4 3.3-5.4Z"/>
    <path fill="#6b4423" d="M4.6 19.6h14.8v2.2H4.6z"/>
  </svg>`,
  cooking: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4a4844" d="M3.6 8.4h16.8v6.2a5.6 5.6 0 0 1-5.6 5.6H9.2a5.6 5.6 0 0 1-5.6-5.6Z"/>
    <path fill="#2f2e2b" d="M3.6 12.8h16.8v1.8a5.6 5.6 0 0 1-5.6 5.6H9.2a5.6 5.6 0 0 1-5.6-5.6Z"/>
    <path fill="#8d939b" d="M2.2 6.8h19.6v2H2.2z"/>
    <path fill="none" stroke="#c9ced6" stroke-width="1.4" stroke-linecap="round" d="M8.6 5.2c0-1.2 1.2-1.4 1.2-2.6M13 5.2c0-1.2 1.2-1.4 1.2-2.6"/>
  </svg>`,
  smithing: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 20.4 15.4 12" stroke="#6b4423" stroke-width="2.6" stroke-linecap="round"/>
    <path fill="#8d939b" d="m13.4 4.6 6 6-3 3-6-6Z"/>
    <path fill="#5f656d" d="m16.4 7.6 3 3-3 3-3-3Z"/>
  </svg>`,
  crafting: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#c9ced6" d="M17.6 3 20 5.4 8.6 16.8 6.2 14.4Z"/>
    <path fill="#8d939b" d="m17.6 3 1.2 1.2L7.4 15.6l-1.2-1.2Z"/>
    <path fill="#c8a040" d="M6.2 14.4 8.6 16.8 4 20Z"/>
    <path fill="none" stroke="#b5541f" stroke-width="1.3" d="M4.6 10.4c2.6-2 2.6-5 0-7"/>
  </svg>`,
  fletching: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4.4 19.6 18 6" stroke="#9a6a3a" stroke-width="1.8" stroke-linecap="round"/>
    <path fill="#c9ced6" d="M17 3.2 21 2.4 20.2 6.4 17.6 7.2 16.2 5.8Z"/>
    <path fill="#3f6a2f" d="M4.4 19.6 8 18.4l-1.2 3.4Zm0 0L5.6 16l3.4-1.2Z"/>
  </svg>`,
  ranged: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="none" stroke="#a8764a" stroke-width="2" stroke-linecap="round" d="M5 3c6 4 6 14 0 18"/>
    <path fill="none" stroke="#e8e0c8" stroke-width="0.9" d="M5 3v18"/>
    <path fill="none" stroke="#c0a070" stroke-width="1.6" stroke-linecap="round" d="M5 12h13"/>
    <path fill="#c9ced6" d="m17 9.6 4.6 2.4-4.6 2.4Z"/>
    <path fill="#a83030" d="M5 10.4 8.2 12 5 13.6Z"/>
  </svg>`,
  magic: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#7fc4ff" d="M12 2.2 14 9.6 21.5 12 14 14.4 12 21.8 10 14.4 2.5 12 10 9.6Z"/>
    <path fill="#ffffff" d="M12 6.4 13.2 10.6 17.4 12 13.2 13.4 12 17.6 10.8 13.4 6.6 12 10.8 10.6Z"/>
    <path fill="#ff7a1e" d="m18.6 3.4.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9Z"/>
    <path fill="#b090ff" d="m5 16 .7 1.8 1.8.7-1.8.7L5 21l-.7-1.8-1.8-.7 1.8-.7Z"/>
  </svg>`,
  prayer: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#e8dcc0" d="M9.6 21c-3.2-2.6-4.3-5.4-3.3-8.4L8.2 7l1.6 5.4L9.4 5l2.1.5.5 8.2c.3-3 1.2-5.2 2.6-6.8l1.6 1c-1.2 2-1.8 4.3-1.8 6.9L16.6 11l1.7 1.2-3.1 5.4c-.7 1.4-2.6 2.6-5.6 3.4Z"/>
    <path fill="#ffd23f" d="M12 1.6c1.6 1.5 2.4 2.9 2.4 4.3 0 1.4-.8 2.4-2.4 3-1.6-.6-2.4-1.6-2.4-3 0-1.4.8-2.8 2.4-4.3Z"/>
    <path fill="#fff6cc" d="M12 4.2c.7.8 1 1.5 1 2.1 0 .7-.3 1.2-1 1.5-.7-.3-1-.8-1-1.5 0-.6.3-1.3 1-2.1Z"/>
  </svg>`,
  // Runesmithing (Phase 18): a rune tablet in carved stone, its spiral sign catching the light.
  runesmithing: `<svg class="skill-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#6a6478" d="M8 3h8l5 5v8l-5 5H8l-5-5V8Z"/>
    <path fill="#4a4458" d="M12 3h4l5 5v8l-5 5h-4Z"/>
    <path fill="none" stroke="#e6dcff" stroke-width="1.6" stroke-linecap="round" d="M12 7.5c2.6 0 4.2 1.8 4.2 4.1s-1.8 4-4 4c-1.7 0-2.9-1.2-2.9-2.8 0-1.4 1-2.4 2.3-2.4"/>
  </svg>`,
};
