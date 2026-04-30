# Translate Naming Dual-Direction Design

**Date:** 2026-03-13

## Goal

Enhance the existing `translate-naming` module so it supports both Chinese-to-English and English-to-Chinese translation in the same screen, while still generating developer-friendly naming variants.

## Confirmed Scope

- Keep the existing `translate-naming` module instead of creating a new tool page.
- Support two directions in one panel:
  - `中 -> 英`
  - `英 -> 中`
- Use online translation only.
- Preserve naming generation as part of the workflow.

## UX Design

The module remains a single-page tool. A new direction switch is added near the top of the input area. The input placeholder and submit button label change with the selected direction so the user always understands what the tool expects.

The results area is split into two logical cards:

1. Translation result
2. Naming result

For `中 -> 英`:
- Show the translated English text
- Show the cleaned English word list
- Generate naming styles from the translated English words

For `英 -> 中`:
- Show the translated Chinese text
- Normalize the original English input into a word list
- Generate naming styles from the normalized English words

## Data Flow

The module state should be expanded to include:

- `direction`
- `translatedText`
- `englishWords`
- `results`
- `loading`
- `error`
- `copiedIndex`

Submit flow:

1. Trim the input text
2. Validate non-empty input
3. Clear prior error and copied state
4. Call the online translation API with the selected language pair
5. Parse the translated text
6. Build the word list used for naming
7. Generate naming variants
8. Render translation and naming sections

## Parsing Rules

Chinese-to-English:
- Use the translated English response
- Normalize punctuation to spaces
- Split into words
- Drop empty items and pure numbers

English-to-Chinese:
- Use the translated Chinese response only for display
- Use the original English input for naming generation
- Normalize separators such as spaces, hyphens, and underscores before splitting

## Error Handling

- Do not use the local fallback dictionary anymore
- If the online translation request fails or returns an invalid payload, show a clear error message
- Keep the user's input intact after failure
- Clear stale translation and naming results when a request fails

## Testing Intent

Tests should verify:

- Direction switching updates the UI copy
- `中 -> 英` success renders translated text and naming results
- `英 -> 中` success renders Chinese translation and naming results from normalized English input
- Request failure shows an online translation error and does not use local fallback behavior

## Constraints Noted

- The repository currently has no test framework configured
- The workspace does not appear to be a git repository, so the required design-doc commit cannot be performed here
