import type { SkillKey } from "../../shared/skills.ts";

// Skill pictures, drawn as small SVGs (24×24): a hatchet, a pick and a fish. They label the skills tab and
// ride along with XP drops.
export const SKILL_ICONS: Record<SkillKey, string> = {
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
