import React from "react";
import {
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../src/app/providers/AppProvider";
import { HomeScreen } from "../src/features/home/HomeScreen";
import { Backend } from "../src/services/backend";
import { ContentRepository } from "../src/repositories/contracts";
import { mockContentRepository } from "../src/repositories/mockRepository";
import { fixtures } from "../src/repositories/fixtures";
import { HomeSection, parseHomeSections } from "../src/domain/home";
import { localStore, initialState } from "../src/services/storage/localStore";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const navigation = { navigate: jest.fn() };
function renderHome(
  getHome: ContentRepository["getHome"],
  language: "hi" | "en" = "en",
) {
  jest.spyOn(localStore, "read").mockResolvedValue({
    ...initialState,
    language,
  });
  const backend: Backend = {
    mode: "fixture",
    session: { ensureSession: async () => null },
    content: { ...mockContentRepository, getHome },
  };
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider loadBackend={async () => backend}>
        <HomeScreen navigation={navigation as never} route={{} as never} />
      </AppProvider>
    </SafeAreaProvider>,
  );
}
const sectionIds = (screen: ReturnType<typeof renderHome>) =>
  screen
    .getAllByTestId(/^home-section-/)
    .map((node) => String(node.props.testID).replace("home-section-", ""));
beforeEach(() => {
  jest.spyOn(localStore, "write").mockResolvedValue();
  navigation.navigate.mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
});

test("renders banners first, then CMS sections in the configured order", async () => {
  const getHome = jest.fn(mockContentRepository.getHome);
  const screen = renderHome(getHome);
  await waitFor(() =>
    expect(screen.getByText("Aarti collection")).toBeTruthy(),
  );
  expect(getHome).toHaveBeenCalledWith("en");
  expect(sectionIds(screen)).toEqual([
    "progress",
    "shortcuts",
    "sadhana",
    "trending",
    "aarti-sangrah",
    "quote",
  ]);
  // Hidden in the layout, so never in the feed.
  expect(screen.queryByText("Bhajans")).toBeNull();
  expect(screen.getByLabelText(/Begin with a little bhakti\./)).toBeTruthy();
  fireEvent.press(screen.getByText("Aarti"));
  expect(navigation.navigate).toHaveBeenLastCalledWith("Explore", {
    category: "AARTI",
  });
  fireEvent.press(screen.getAllByLabelText("Durga aarti")[0]);
  expect(navigation.navigate).toHaveBeenLastCalledWith("Content", {
    contentId: "aarti-durga",
  });
});

test("reads the Hindi feed and shows Hindi titles in its own order", async () => {
  const getHome = jest.fn(mockContentRepository.getHome);
  const screen = renderHome(getHome, "hi");
  await waitFor(() => expect(screen.getByText("आरती संग्रह")).toBeTruthy());
  expect(getHome).toHaveBeenCalledWith("hi");
  expect(screen.queryByText("Aarti collection")).toBeNull();
  expect(sectionIds(screen)).toEqual([
    "sadhana",
    "shortcuts",
    "aarti-sangrah",
    "trending",
    "progress",
    "quote",
  ]);
});

test("unknown, hidden and malformed sections are ignored safely", async () => {
  const card = {
    id: "bhajan-1",
    type: "BHAJAN",
    title: { en: "A morning with Krishna", hi: "कृष्ण के संग एक सुबह" },
    media: { thumb: { key: "placeholder/krishna" } },
  };
  const parsed = parseHomeSections([
    { id: "future", type: "HOROSCOPE_WALL", order: 0, visible: true },
    {
      id: "rail",
      type: "RAIL",
      order: 30,
      visible: true,
      title: { en: "New for you", hi: "आपके लिए नया" },
      items: [card, { id: "bad" }],
      futureField: true,
    },
    { id: "sadhana", type: "SADHANA", order: 10, visible: true },
    { id: "hidden", type: "PROGRESS", order: 20, visible: false },
    { id: "no-title-rail", type: "RAIL", order: 40, visible: true, items: [] },
    "not a section",
  ]);
  // A section type the app does not know that slipped past parsing.
  const sections = [
    ...parsed,
    { id: "raw-unknown", type: "LEAGUE", order: 99, visible: true },
  ] as unknown as HomeSection[];
  const screen = renderHome(async (language) => ({
    language,
    banners: [],
    sections,
  }));
  await waitFor(() => expect(screen.getByText("New for you")).toBeTruthy());
  expect(sectionIds(screen)).toEqual(["sadhana", "rail", "raw-unknown"]);
  expect(
    within(screen.getByTestId("home-section-raw-unknown")).queryAllByText(/./),
  ).toHaveLength(0);
  expect(screen.getAllByLabelText("A morning with Krishna")).toHaveLength(1);
});

test("shows the empty state and recovers from a failed feed read", async () => {
  const empty = renderHome(async () => null);
  await waitFor(() =>
    expect(
      empty.getByText(
        "Today’s Home is being prepared. Please check back soon.",
      ),
    ).toBeTruthy(),
  );
  empty.unmount();
  const getHome = jest
    .fn<ReturnType<ContentRepository["getHome"]>, ["hi" | "en"]>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(async (language) => ({
      language,
      banners: fixtures.banners,
      sections: [],
    }));
  const screen = renderHome(getHome);
  await waitFor(() =>
    expect(screen.getByText("We couldn’t load this")).toBeTruthy(),
  );
  fireEvent.press(screen.getByText("Try again"));
  await waitFor(() =>
    expect(screen.getByLabelText(/Your mandir\. Your moment\./)).toBeTruthy(),
  );
  expect(getHome).toHaveBeenCalledTimes(2);
});
