type RequestFrame = (callback: FrameRequestCallback) => number;
type CancelFrame = (handle: number) => void;

export function createRafMeasurementScheduler(
  measure: () => void,
  requestFrame: RequestFrame = window.requestAnimationFrame.bind(window),
  cancelFrame: CancelFrame = window.cancelAnimationFrame.bind(window),
) {
  let frameId: number | null = null;
  let disposed = false;

  const cancel = () => {
    disposed = true;
    if (frameId !== null) {
      cancelFrame(frameId);
      frameId = null;
    }
  };

  const schedule = () => {
    if (disposed) return;
    if (frameId !== null) {
      cancelFrame(frameId);
    }

    frameId = requestFrame(() => {
      frameId = null;
      if (!disposed) {
        measure();
      }
    });
  };

  return { cancel, schedule };
}
