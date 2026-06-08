import { isIOS12 } from "@/lib/legacy-safari";

export type YardDomBridgeHandlers = {
  onBridgeTap: () => void;
  selectRace: (raceId: string) => void;
  selectRunner: (runnerNo: number) => void;
  goPrev: () => void;
  goNext: () => void;
  tapAssessment: (factor: string) => void;
};

/** iOS 12: native capture click delegation — React onClick is unreliable on Yard route. */
export function installIOS12YardDomBridge(
  getHandlers: () => YardDomBridgeHandlers,
  root: ParentNode = document,
): () => void {
  if (!isIOS12()) return () => {};

  const onClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const el = target.closest("[data-yard-action]");
    if (!el || !(el instanceof HTMLElement)) return;

    const action = el.getAttribute("data-yard-action");
    if (!action) return;

    const handlers = getHandlers();
    handlers.onBridgeTap();

    switch (action) {
      case "select-race": {
        const raceId = el.getAttribute("data-race-id") ?? el.getAttribute("data-race-no");
        if (raceId) handlers.selectRace(raceId);
        break;
      }
      case "select-runner": {
        const runnerId = el.getAttribute("data-runner-id");
        if (runnerId) handlers.selectRunner(Number(runnerId));
        break;
      }
      case "assessment": {
        const factor = el.getAttribute("data-factor");
        if (factor) handlers.tapAssessment(factor);
        break;
      }
      case "prev-runner":
        handlers.goPrev();
        break;
      case "next-runner":
        handlers.goNext();
        break;
      default:
        break;
    }
  };

  root.addEventListener("click", onClick, true);
  return () => root.removeEventListener("click", onClick, true);
}
