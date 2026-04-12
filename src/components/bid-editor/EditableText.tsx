"use client";

import { useRef, useEffect, useCallback } from "react";

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  as?: "p" | "h2" | "h3" | "h4" | "span" | "li";
  className?: string;
  placeholder?: string;
}

export function EditableText({
  value,
  onChange,
  as: Tag = "p",
  className = "",
  placeholder = "",
}: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastValueRef = useRef(value);

  // Sync external value changes (e.g. AI regeneration) into the DOM
  useEffect(() => {
    if (ref.current && value !== lastValueRef.current) {
      ref.current.textContent = value;
      lastValueRef.current = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
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

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={handleBlur}
      className={`outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1 rounded px-0.5 -mx-0.5 ${className}`}
      data-placeholder={placeholder}
    >
      {value}
    </Tag>
  );
}
