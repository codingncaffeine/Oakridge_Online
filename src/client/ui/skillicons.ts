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
};
