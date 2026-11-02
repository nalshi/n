# Authentication surface

## Mode

Operate

## Purpose

Help a merchant sign in, create a store account, verify a phone, or recover access with minimal friction.

## World

An Arabic modular type specimen: the wordmark is built as a compact set of typographic cells, while a visible construction grid gives the brand panel its structure. The grid contributes typography, density, palette, and one signature mark; it does not replace familiar form controls or task layout.

## First viewport

- On wide screens, the Arabic brand panel and the authentication task occupy adjacent regions; the form remains the primary work area.
- On phones and tablets, the brand panel becomes a compact masthead above the form.
- Sign-up keeps its required fields grouped into readable pairs on wider screens and one column on narrow screens.
- The form area remains scrollable when content exceeds the viewport.

## Visual system

- Palette: deep ink teal for the brand panel, warm paper for the task surface, white input surfaces, and restrained saffron accents.
- Type: use the existing IBM Plex Sans Arabic/Cairo system with clear weight and size steps; do not introduce a decorative display face.
- Signature: the wordmark sits in a small two-by-two Arabic letter grid. A faint construction grid stays confined to the brand panel and is removed from compact viewports.
- Elevation: use separation and one-pixel borders rather than stacked card shadows.

## Interaction and accessibility

- Preserve all existing API actions, validations, redirects, session behavior, and OTP timing.
- Keep keyboard focus visible, errors attached to their fields, and loading states explicit.
- Maintain RTL, light/dark themes, reduced-motion support, and minimum touch targets.
- Do not add product claims, external imagery, or changes outside authentication.
