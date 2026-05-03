import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditableText } from "../EditableText";

describe("EditableText counter", () => {
  it("does not render counter when budget is undefined", () => {
    render(<EditableText value="hej" onChange={() => {}} />);
    expect(screen.queryByTestId("char-counter")).not.toBeInTheDocument();
  });

  it("renders counter when budget is provided", () => {
    render(<EditableText value="hej" onChange={() => {}} budget={120} />);
    const counter = screen.getByTestId("char-counter");
    expect(counter).toHaveTextContent("3/120");
  });

  it("counter shows red color when length exceeds budget", () => {
    render(<EditableText value={"x".repeat(150)} onChange={() => {}} budget={120} />);
    const counter = screen.getByTestId("char-counter");
    expect(counter).toHaveTextContent("150/120");
    expect(counter.className).toMatch(/text-red/);
  });

  it("counter shows neutral color when length is under budget", () => {
    render(<EditableText value="kort" onChange={() => {}} budget={120} />);
    const counter = screen.getByTestId("char-counter");
    expect(counter.className).not.toMatch(/text-red/);
  });
});
