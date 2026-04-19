import test from "node:test";
import assert from "node:assert/strict";

import {
  FAST_FIRST_REVEAL_TUNING,
  REVEAL_TUNING_PRESETS,
  SOFT_FINISH_REVEAL_TUNING,
  mergeRevealTuning,
  resolveRevealTuningPreset,
} from "../dist/index.js";

test("resolveRevealTuningPreset returns named presets", () => {
  assert.equal(resolveRevealTuningPreset("balanced"), REVEAL_TUNING_PRESETS.balanced);
  assert.equal(resolveRevealTuningPreset("fastFirst"), FAST_FIRST_REVEAL_TUNING);
  assert.equal(resolveRevealTuningPreset("softFinish"), SOFT_FINISH_REVEAL_TUNING);
});

test("mergeRevealTuning starts from the selected preset before applying overrides", () => {
  const merged = mergeRevealTuning(
    {
      targetExtraMs: 140,
      stepRateMultipliers: { complete: 1.4 },
    },
    "softFinish",
  );

  assert.equal(merged.reserveMinFrames, SOFT_FINISH_REVEAL_TUNING.reserveMinFrames);
  assert.equal(merged.targetExtraMs, 140);
  assert.equal(
    merged.stepRateMultipliers.steady,
    SOFT_FINISH_REVEAL_TUNING.stepRateMultipliers.steady,
  );
  assert.equal(merged.stepRateMultipliers.complete, 1.4);
});
