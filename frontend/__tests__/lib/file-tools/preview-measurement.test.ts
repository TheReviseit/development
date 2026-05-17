import { createRafMeasurementScheduler } from "@/lib/file-tools/preview-measurement";

describe("preview measurement scheduler", () => {
  it("coalesces rapid resize notifications into one measurement per animation frame", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    const measure = jest.fn();
    let nextFrameId = 0;

    const scheduler = createRafMeasurementScheduler(
      measure,
      (callback) => {
        nextFrameId += 1;
        callbacks.set(nextFrameId, callback);
        return nextFrameId;
      },
      (frameId) => {
        callbacks.delete(frameId);
      },
    );

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    expect(callbacks.size).toBe(1);
    expect(measure).not.toHaveBeenCalled();

    const callback = Array.from(callbacks.values())[0];
    callback(16);

    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("cancels stale frames when the preview unmounts", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    const measure = jest.fn();
    let nextFrameId = 0;

    const scheduler = createRafMeasurementScheduler(
      measure,
      (callback) => {
        nextFrameId += 1;
        callbacks.set(nextFrameId, callback);
        return nextFrameId;
      },
      (frameId) => {
        callbacks.delete(frameId);
      },
    );

    scheduler.schedule();
    scheduler.cancel();

    expect(callbacks.size).toBe(0);
    expect(measure).not.toHaveBeenCalled();

    scheduler.schedule();

    expect(callbacks.size).toBe(0);
    expect(measure).not.toHaveBeenCalled();
  });
});
