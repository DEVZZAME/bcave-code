import { describe, expect, it } from "vitest";
import { deployChoices } from "../deploy-catalog.js";

describe("deployment catalog", () => {
  it("provides stable platform answers for the deploy command", () => {
    expect(deployChoices().map((choice) => choice.answer)).toEqual(["local", "vercel", "railway", "fly", "aws", "vps"]);
  });

  it("provides conversation step numbers after stack selection", () => {
    expect(deployChoices("post-stack").map((choice) => choice.answer)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("returns copies that callers cannot use to mutate the catalog", () => {
    const first = deployChoices();
    first[0].label = "changed";
    expect(deployChoices()[0].label).not.toBe("changed");
  });
});
