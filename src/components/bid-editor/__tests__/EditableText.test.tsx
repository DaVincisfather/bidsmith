import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditableText } from "../EditableText";

describe("EditableText counter", () => {
  it("renders no char counter wrapper", () => {
    render(<EditableText value="text" onChange={() => {}} />);
    expect(screen.queryByTestId("char-counter")).not.toBeInTheDocument();
  });
});
