import React from "react";
import { cn } from "@/lib/utils";

// Strict regex matching HTTP and HTTPS URLs only
const URL_REGEX = /https?:\/\/[^\s<>'"]+/gi;

// Trailing punctuation that should not be part of the URL when written in prose
const TRAILING_PUNCTUATION_REGEX = /[.,!?:;]+$/;

export interface SafeMessageBodyProps {
  body: string;
  isInbound?: boolean;
  className?: string;
}

/**
 * Trims trailing punctuation and unbalanced closing parentheses from a raw URL.
 * Returns the cleaned URL and any detached trailing punctuation.
 */
function cleanUrlAndPunctuation(rawUrl: string): { url: string; punctuation: string } {
  let url = rawUrl;
  let punctuation = "";

  // 1. Extract trailing punctuation (. , ! ? : ;)
  const punctMatch = url.match(TRAILING_PUNCTUATION_REGEX);
  if (punctMatch) {
    punctuation = punctMatch[0];
    url = url.slice(0, -punctuation.length);
  }

  // 2. Handle trailing closing parenthesis:
  // If the URL ends with ')' and there are more ')' than '(' in the URL,
  // the trailing ')' belongs to the enclosing prose, e.g. "(https://example.com)"
  while (url.endsWith(")")) {
    const openCount = (url.match(/\(/g) || []).length;
    const closeCount = (url.match(/\)/g) || []).length;
    if (closeCount > openCount) {
      punctuation = ")" + punctuation;
      url = url.slice(0, -1);
      // Re-check for any punctuation before the closing paren, e.g. "https://example.com.)"
      const innerPunct = url.match(TRAILING_PUNCTUATION_REGEX);
      if (innerPunct) {
        punctuation = innerPunct[0] + punctuation;
        url = url.slice(0, -innerPunct[0].length);
      }
    } else {
      break;
    }
  }

  return { url, punctuation };
}

export function SafeMessageBody({ body, isInbound = true, className }: SafeMessageBodyProps) {
  if (!body) return null;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state for fresh execution
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(body)) !== null) {
    const rawMatch = match[0];
    const matchIndex = match.index;

    // Push preceding plain text if any
    if (matchIndex > lastIndex) {
      elements.push(body.slice(lastIndex, matchIndex));
    }

    const { url, punctuation } = cleanUrlAndPunctuation(rawMatch);

    // Whitelist check: strictly http:// or https://
    const isWhitelisted = /^https?:\/\//i.test(url);

    if (isWhitelisted && url.length > 0) {
      elements.push(
        <a
          key={`link-${matchIndex}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "underline break-all font-medium transition-opacity hover:opacity-80",
            isInbound
              ? "text-primary hover:text-primary/80"
              : "text-primary-foreground underline-offset-2 hover:text-primary-foreground/90",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>,
      );
    } else {
      // If for any reason it wasn't whitelisted, render raw text
      elements.push(url);
    }

    if (punctuation) {
      elements.push(punctuation);
    }

    lastIndex = matchIndex + rawMatch.length;
  }

  // Push remaining plain text
  if (lastIndex < body.length) {
    elements.push(body.slice(lastIndex));
  }

  return (
    <span className={cn("whitespace-pre-wrap break-words leading-relaxed", className)}>
      {elements}
    </span>
  );
}
