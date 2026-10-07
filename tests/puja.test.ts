import { offeringsFor, trayItems } from "../src/domain/puja";
import {
  defaultSadhanaConfig,
  requiredPrayerIds,
} from "../src/domain/progression";

describe("puja offerings by deity (D-054)", () => {
  it("never offers forbidden flowers", () => {
    expect(offeringsFor("shiva").flowers).not.toContain("tulsi");
    expect(offeringsFor("shiva").flowers).toContain("bilva");
    expect(offeringsFor("ganesha").flowers).not.toContain("tulsi");
    expect(offeringsFor("ganesha").flowers).toContain("durva");
    expect(offeringsFor("durga").flowers).not.toContain("durva");
  });
  it("gives each deity a favourite bhog", () => {
    expect(offeringsFor("ganesha").bhog).toContain("modak");
    expect(offeringsFor("krishna").bhog).toContain("makhanMishri");
    expect(offeringsFor("krishna").tulsiOnBhog).toBe(true);
    expect(offeringsFor("hanuman").bhog).toContain("laddoo");
    expect(offeringsFor("shiva").tilak).toBe("tripundra");
  });
  it("falls back to general offerings for an unknown deity", () => {
    expect(offeringsFor("someone-new").flowers).toEqual([
      "genda",
      "rose",
      "jasmine",
    ]);
    expect(offeringsFor(null).bhog.length).toBeGreaterThan(0);
  });
  it("requires the five core offerings, in tray order", () => {
    expect(requiredPrayerIds(defaultSadhanaConfig)).toEqual([
      "pushp",
      "dhoop",
      "naivedya",
      "deep",
      "shankh",
    ]);
    expect(defaultSadhanaConfig.prayerItems.map((item) => item.kind)).toEqual([
      ...trayItems,
    ]);
  });
});
