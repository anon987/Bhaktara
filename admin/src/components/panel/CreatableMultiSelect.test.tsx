import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreatableMultiSelect, type MultiOption } from "./CreatableMultiSelect";

const deities: MultiOption[] = [
  { value: "hanuman", label: "Hanuman", hint: "हनुमान" },
  { value: "shiva", label: "Shiva", hint: "शिव" },
];

function Harness({
  initial = [],
  onCreate,
  askHindi,
  onChange,
}: {
  initial?: string[];
  onCreate?: (input: { label: string; hindi: string }) => Promise<MultiOption>;
  askHindi?: boolean;
  onChange?: (value: string[]) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CreatableMultiSelect
      label="Deities"
      noun="deity"
      options={deities}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      onCreate={onCreate}
      askHindi={askHindi}
    />
  );
}

const open = async () => userEvent.click(screen.getByRole("combobox", { name: /Deities/ }));
const search = (text: string) =>
  userEvent.type(screen.getByRole("combobox", { name: "Search deities" }), text);
const selected = () => screen.queryByRole("list", { name: "Selected deities" });

describe("CreatableMultiSelect", () => {
  it("selects an existing option by searching in either language", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} onCreate={vi.fn()} />);
    await open();
    await search("शिव");
    expect(screen.queryByRole("option", { name: /Hanuman/ })).not.toBeInTheDocument();
    // An exact match is never offered for creation.
    expect(screen.queryByRole("option", { name: /Create/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Shiva/ }));
    expect(onChange).toHaveBeenLastCalledWith(["shiva"]);
    expect(within(selected()!).getByText("Shiva")).toBeInTheDocument();
  });

  it("creates a typed value and selects it", async () => {
    const onCreate = vi.fn(async ({ label }: { label: string }) => ({ value: label.toLowerCase(), label }));
    const onChange = vi.fn();
    render(<Harness onCreate={onCreate} onChange={onChange} />);
    await open();
    await search("han");
    // Matches first, "Create" last.
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Hanumanहनुमान",
      "Create “han”",
    ]);
    await search("{Backspace}{Backspace}{Backspace}Ganesha");
    await userEvent.click(screen.getByRole("option", { name: "Create “Ganesha”" }));
    expect(onCreate).toHaveBeenCalledWith({ label: "Ganesha", hindi: "" });
    expect(onChange).toHaveBeenLastCalledWith(["ganesha"]);
    expect(within(selected()!).getByText("Ganesha")).toBeInTheDocument();
  });

  it("asks for an optional Hindi name before creating", async () => {
    const onCreate = vi.fn(async ({ label, hindi }: { label: string; hindi: string }) => ({
      value: "ganesha",
      label,
      hint: hindi,
    }));
    render(<Harness onCreate={onCreate} askHindi />);
    await open();
    await search("Ganesha");
    await userEvent.click(screen.getByRole("option", { name: "Create “Ganesha”" }));
    expect(screen.getByLabelText("Name in English")).toHaveValue("Ganesha");
    await userEvent.type(screen.getByLabelText("Name in Hindi (optional)"), "गणेश");
    await userEvent.click(screen.getByRole("button", { name: "Create deity" }));
    expect(onCreate).toHaveBeenCalledWith({ label: "Ganesha", hindi: "गणेश" });
    expect(within(selected()!).getByText("गणेश")).toBeInTheDocument();
  });

  it("shows why a create failed", async () => {
    const onCreate = vi.fn(async () => {
      throw new Error("Your role cannot do this.");
    });
    render(<Harness onCreate={onCreate} />);
    await open();
    await search("Ganesha");
    await userEvent.click(screen.getByRole("option", { name: "Create “Ganesha”" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your role cannot do this.");
    expect(selected()).not.toBeInTheDocument();
  });

  it("hides Create without onCreate", async () => {
    render(<Harness />);
    await open();
    await search("Ganesha");
    expect(screen.queryByRole("option", { name: /Create/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nothing found.")).toBeInTheDocument();
  });

  it("removes a chip", async () => {
    const onChange = vi.fn();
    render(<Harness initial={["hanuman", "shiva"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Hanuman" }));
    expect(onChange).toHaveBeenLastCalledWith(["shiva"]);
    expect(within(selected()!).queryByText("Hanuman")).not.toBeInTheDocument();
  });
});
