"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  as?: "p" | "h2" | "h3" | "h4" | "span" | "li";
  className?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  budget?: number;
  dataFieldPath?: string;
}

export function EditableText({
  value,
  onChange,
  as: Tag = "p",
  className = "",
  placeholder = "",
  style,
  budget,
  dataFieldPath,
}: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastValueRef = useRef(value);
  const [length, setLength] = useState(value.length);

  // Sync external value changes (e.g. AI regeneration) into the DOM
  useEffect(() => {
    if (ref.current && value !== lastValueRef.current) {
      ref.current.textContent = value;
      lastValueRef.current = value;
      setLength(value.length);
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (ref.current) {
      setLength(ref.current.textContent?.length ?? 0);
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const text = ref.current?.textContent ?? "";
      if (text !== lastValueRef.current) {
        lastValueRef.current = text;
        onChange(text);
      }
    }, 1000);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const text = ref.current?.textContent ?? "";
    if (text !== lastValueRef.current) {
      lastValueRef.current = text;
      onChange(text);
    }
  }, [onChange]);

  const tagElement = (
    <Tag
      ref={ref as React.RefObject<never>}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={handleBlur}
      className={`outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1 rounded px-0.5 -mx-0.5 ${className}`}
      data-placeholder={placeholder}
      data-field-path={dataFieldPath}
      style={style}
    >
      {value}
    </Tag>
  );

  // No wrapper when there's no counter to position — keeps HTML clean for the
  // ~40+ EditableText instances that don't pass a budget (PR-routine flag).
  // Use <div> not <span> so the wrapper is valid even when Tag is a block element (h4/p).
  if (budget === undefined) {
    return tagElement;
  }

  return (
    <div className="relative inline-block w-full">
      {tagElement}
      <span
        data-testid="char-counter"
        className={`absolute -bottom-4 right-0 text-[10px] tabular-nums ${
          length > budget ? "text-red-600 font-medium" : "text-gray-400"
        }`}
      >
        {length}/{budget}
      </span>
    </div>
  );
}
