type PointerSample = {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
};

/** A short primary-pointer press; moving away and back still counts as a drag. */
export class ReadingClickTracker {
  private start: PointerSample | null = null;

  begin(sample: PointerSample, primary: boolean, button: number) {
    const alreadyPressed = this.start !== null;
    this.cancel();
    // Native PointerEvent coordinates live on its prototype, not enumerable
    // own properties. Copy them explicitly rather than spreading the event.
    if (primary && button === 0 && !alreadyPressed) this.start = {
      pointerId: sample.pointerId, clientX: sample.clientX,
      clientY: sample.clientY, timeStamp: sample.timeStamp,
    };
  }

  move(sample: PointerSample) {
    if (this.start && (sample.pointerId !== this.start.pointerId ||
        Math.hypot(sample.clientX - this.start.clientX, sample.clientY - this.start.clientY) > 6)) {
      this.cancel();
    }
  }

  finish(sample: PointerSample) {
    this.move(sample);
    const start = this.start;
    this.cancel();
    const elapsed = start ? sample.timeStamp - start.timeStamp : -1;
    return start !== null && elapsed >= 0 && elapsed <= 350;
  }

  cancel() { this.start = null; }
}
