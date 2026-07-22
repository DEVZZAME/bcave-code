import { describe, expect, it } from "vitest";
import { doctorExitCode, type DoctorCheck } from "../doctor.js";

describe("doctorExitCode", () => {
  it("returns zero when every check passes", () => {
    const checks: DoctorCheck[] = [{ label: "entry", ok: true, detail: "ok" }];
    expect(doctorExitCode(checks)).toBe(0);
  });

  it("returns one when a check fails", () => {
    const checks: DoctorCheck[] = [
      { label: "entry", ok: true, detail: "ok" },
      { label: "assets", ok: false, detail: "missing", code: "BCAVE_ASSETS_MISSING" },
    ];
    expect(doctorExitCode(checks)).toBe(1);
  });
});
