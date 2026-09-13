'use strict';

/**
 * Heuristic parser that turns free-form shared text (e.g. a recipe pasted
 * out of a Claude conversation, or shared via the OS share sheet) into a
 * best-effort structured recipe draft. It is intentionally forgiving —
 * the result is always shown to the user in the edit form before saving,
 * so false positives just mean a little manual tidy-up rather than data
 * loss.
 */

const URL_RE = /https?:\/\/[^\s)]+/i;

const INGREDIENT_HEADINGS = /^(ingredients?)\s*:?\s*$/i;
const INSTRUCTION_HEADINGS = /^(instructions?|directions?|method|steps?|preparation)\s*:?\s*$/i;
const NOTES_HEADINGS = /^(notes?|tips?)\s*:?\s*$/i;

const SERVINGS_RE = /\b(?:servings?|serves|yield)\s*:?\s*(.+)$/i;
const PREP_RE = /\bprep(?:aration)?\s*time\s*:?\s*(.+)$/i;
const COOK_RE = /\bcook(?:ing)?\s*time\s*:?\s*(.+)$/i;
const TOTAL_RE = /\btotal\s*time\s*:?\s*(.+)$/i;

function stripHeadingMarkup(line) {
  // Strip markdown heading markers (#, ##...), bold (**text**), and
  // trailing colons so "## Ingredients" / "**Ingredients:**" both match.
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s*/, '')
    .trim();
}

function stripListMarker(line) {
  return line
    .replace(/^[-*•▪◦]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\*\*/g, '')
    .trim();
}

function classifyHeading(rawLine) {
  const line = stripHeadingMarkup(rawLine);
  if (INGREDIENT_HEADINGS.test(line)) return 'ingredients';
  if (INSTRUCTION_HEADINGS.test(line)) return 'instructions';
  if (NOTES_HEADINGS.test(line)) return 'notes';
  return null;
}

function parseSharedText(rawText, rawUrl) {
  const text = (rawText || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n').map((l) => l.trim());

  const urlMatch = text.match(URL_RE);
  const sourceUrl = (rawUrl && rawUrl.trim()) || (urlMatch ? urlMatch[0] : '');

  let title = '';
  const ingredients = [];
  const instructions = [];
  const notesLines = [];
  let servings = '';
  let prepTime = '';
  let cookTime = '';

  let section = null; // null | 'ingredients' | 'instructions' | 'notes'
  let titleCaptured = false;

  for (const line of lines) {
    if (!line) continue;
    if (URL_RE.test(line) && line.replace(URL_RE, '').trim() === '') continue; // bare URL line

    const heading = classifyHeading(line);
    if (heading) {
      section = heading;
      continue;
    }

    const servingsMatch = line.match(SERVINGS_RE);
    const prepMatch = line.match(PREP_RE);
    const cookMatch = line.match(COOK_RE);
    const totalMatch = line.match(TOTAL_RE);
    if (servingsMatch) {
      servings = servingsMatch[1].trim();
      continue;
    }
    if (prepMatch) {
      prepTime = prepMatch[1].trim();
      continue;
    }
    if (cookMatch) {
      cookTime = cookMatch[1].trim();
      continue;
    }
    if (totalMatch && !cookTime) {
      cookTime = totalMatch[1].trim();
      continue;
    }

    if (!titleCaptured && !section) {
      // First substantial line before any recognized section becomes the
      // title candidate.
      title = stripHeadingMarkup(line);
      titleCaptured = true;
      continue;
    }

    if (section === 'ingredients') {
      ingredients.push(stripListMarker(line));
    } else if (section === 'instructions') {
      instructions.push(stripListMarker(line));
    } else if (section === 'notes') {
      notesLines.push(stripListMarker(line));
    } else if (titleCaptured) {
      // Text before any heading but after the title — treat as description.
      notesLines.push(line);
    }
  }

  if (!title) {
    title = 'Shared recipe';
  }

  return {
    title,
    description: '',
    ingredients: ingredients.filter(Boolean),
    instructions: instructions.filter(Boolean),
    servings,
    prepTime,
    cookTime,
    tags: [],
    sourceUrl,
    notes: notesLines.filter(Boolean).join('\n'),
  };
}

module.exports = { parseSharedText };
