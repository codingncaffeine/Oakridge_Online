import { isComplete, QUESTS, stageOf, TOTAL_QUEST_POINTS, type QuestStages } from "../../shared/quests.ts";

/**
 * The quest journal tab (PLAN Phase 9): the points at the top, every quest coloured by where it stands
 * — red not begun, yellow under way, green complete, as the classic colours its own — and, for the
 * one clicked, its journal: where to find the giver before it is begun, and afterwards the line for
 * each stage reached, the earlier ones greyed.
 */
export class QuestsPanel {
  private stages: QuestStages = {};
  private points = 0;
  private chosen: string | null = null;
  private readonly list = document.getElementById("quest-list") as HTMLElement;
  private readonly total = document.getElementById("quest-points") as HTMLElement;
  private readonly journal = document.getElementById("quest-journal") as HTMLElement;

  constructor() {
    this.render();
  }

  /** Every quest's stage and the points, as the server sends them on entering the world and whenever one changes. */
  set(stages: QuestStages, points: number): void {
    this.stages = { ...stages };
    this.points = points;
    this.render();
  }

  private render(): void {
    this.total.textContent = `Quest points: ${this.points} of ${TOTAL_QUEST_POINTS}`;
    this.list.replaceChildren(...QUESTS.map((q) => {
      const stage = stageOf(this.stages, q.key);
      const state = stage === 0 ? "not" : isComplete(q, stage) ? "done" : "going";
      const b = Object.assign(document.createElement("button"), { type: "button", className: `quest ${state}`, textContent: q.name });
      b.dataset.quest = q.key;
      b.title = stage === 0 ? "Not begun" : isComplete(q, stage) ? "Complete" : "Under way";
      b.addEventListener("click", () => {
        this.chosen = this.chosen === q.key ? null : q.key;
        this.render();
      });
      return b;
    }));
    const q = QUESTS.find((x) => x.key === this.chosen);
    if (!q) {
      this.journal.hidden = true;
      this.journal.replaceChildren();
      return;
    }
    const stage = stageOf(this.stages, q.key);
    const parts: HTMLElement[] = [Object.assign(document.createElement("h5"), { textContent: q.name })];
    if (stage === 0) {
      parts.push(Object.assign(document.createElement("p"), { textContent: q.where }));
      parts.push(Object.assign(document.createElement("p"), { className: "past", textContent: "You have not begun this quest." }));
    } else {
      q.stages.slice(0, stage).forEach((line, i) => {
        parts.push(Object.assign(document.createElement("p"), { className: i < stage - 1 ? "past" : "", textContent: line }));
      });
      if (isComplete(q, stage)) parts.push(Object.assign(document.createElement("p"), { className: "done", textContent: `Quest complete: ${q.points} point${q.points === 1 ? "" : "s"}.` }));
    }
    this.journal.replaceChildren(...parts);
    this.journal.hidden = false;
  }
}
