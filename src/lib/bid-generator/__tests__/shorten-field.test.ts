import { describe, it, expect, vi } from "vitest";
import { shortenField } from "../shorten-field";

describe("shortenField", () => {
  it("returnerar första svaret när det ryms (ingen retry)", async () => {
    const callLLM = vi.fn().mockResolvedValue({ text: "kort text" });
    const res = await shortenField(
      { text: "en lång text", budget: 120, fieldLabel: "Fas – Mål" },
      callLLM,
    );
    expect(res).toEqual({ text: "kort text", length: 9, budget: 120, withinBudget: true });
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  it("gör en retry med strängare instruktion när första svaret är för långt", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce({ text: "x".repeat(150) })
      .mockResolvedValueOnce({ text: "y".repeat(80) });
    const res = await shortenField(
      { text: "urspr", budget: 120, fieldLabel: "Ska-krav" },
      callLLM,
    );
    expect(res.text).toBe("y".repeat(80));
    expect(res.withinBudget).toBe(true);
    expect(callLLM).toHaveBeenCalledTimes(2);
    // Andra anropet påpekar att förra var för långt.
    expect(callLLM.mock.calls[1][0].userContent).toMatch(/150|för långt|för lång/i);
  });

  it("behåller bästa (kortaste) försöket och flaggar withinBudget=false om båda är över", async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce({ text: "x".repeat(150) })
      .mockResolvedValueOnce({ text: "y".repeat(130) });
    const res = await shortenField(
      { text: "urspr", budget: 120, fieldLabel: "Ska-krav" },
      callLLM,
    );
    expect(res.text).toBe("y".repeat(130)); // kortaste av de två
    expect(res.withinBudget).toBe(false);
    expect(callLLM).toHaveBeenCalledTimes(2);
  });

  it("aldrig hård trunkering — texten kortas aldrig till exakt budget", async () => {
    const callLLM = vi.fn().mockResolvedValue({ text: "z".repeat(200) });
    const res = await shortenField(
      { text: "urspr", budget: 100, fieldLabel: "Fält" },
      callLLM,
    );
    // Behåller modellens text som den är (200), trunkerar inte till 100.
    expect(res.text.length).toBe(200);
    expect(res.withinBudget).toBe(false);
  });
});
