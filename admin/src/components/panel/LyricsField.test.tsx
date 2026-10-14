import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LyricsField } from "./LyricsField";
import type { Lyrics } from "../../domain";

const hindi = "[Intro — Female Lead]\nसखी री, आँगन सजा दो,\nआज हनुमत का गुण गाएँ।";

function Harness({
  initial = { hi: hindi, en: "" },
  onFillHinglish,
  busy,
}: {
  initial?: Lyrics;
  onFillHinglish?: (set: (value: Lyrics) => void) => Promise<void>;
  busy?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <LyricsField
      value={value}
      onChange={setValue}
      onFillHinglish={onFillHinglish && (() => onFillHinglish((next) => setValue(next)))}
      busy={busy}
    />
  );
}

describe("LyricsField", () => {
  it("edits both languages with character counts", async () => {
    render(<Harness />);
    expect(screen.getByLabelText(/Hindi lyrics/)).toHaveValue(hindi);
    expect(screen.getByText(`${hindi.length} / 20,000`)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Hinglish lyrics/), "Sakhi ri");
    expect(screen.getByLabelText(/Hinglish lyrics/)).toHaveValue("Sakhi ri");
    expect(screen.getByText("8 / 20,000")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gemini/ })).not.toBeInTheDocument();
  });

  it("previews the lyrics without section notes", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    const preview = screen.getByRole("region", { name: "Hindi lyrics preview" });
    expect(preview).toHaveTextContent("सखी री, आँगन सजा दो,");
    expect(preview).not.toHaveTextContent("Intro");
    expect(screen.getByRole("region", { name: "Hinglish lyrics preview" })).toHaveTextContent("No lyrics to show.");
    expect(screen.queryByLabelText(/Hindi lyrics/, { selector: "textarea" })).not.toBeInTheDocument();
  });

  it("fills the Hinglish lyrics through the callback and reports failures", async () => {
    const fill = vi.fn(async (set: (value: Lyrics) => void) => set({ hi: hindi, en: "Sakhi ri, aangan saja do," }));
    const { unmount } = render(<Harness onFillHinglish={fill} />);
    await userEvent.click(screen.getByRole("button", { name: /Fill Hinglish with Gemini/ }));
    expect(fill).toHaveBeenCalledOnce();
    expect(screen.getByLabelText(/Hinglish lyrics/)).toHaveValue("Sakhi ri, aangan saja do,");
    unmount();

    render(<Harness onFillHinglish={async () => Promise.reject(new Error("quota"))} />);
    await userEvent.click(screen.getByRole("button", { name: /Fill Hinglish with Gemini/ }));
    expect(await screen.findByText(/Could not fill the Hinglish lyrics: quota/)).toBeInTheDocument();
  });

  it("disables the Gemini button while busy or without Hindi lyrics", () => {
    const fill = vi.fn(async () => undefined);
    const { unmount } = render(<Harness onFillHinglish={fill} busy />);
    expect(screen.getByRole("button", { name: /Fill Hinglish with Gemini/ })).toBeDisabled();
    unmount();
    render(<Harness initial={{ hi: "", en: "" }} onFillHinglish={fill} />);
    expect(screen.getByRole("button", { name: /Fill Hinglish with Gemini/ })).toBeDisabled();
  });
});
