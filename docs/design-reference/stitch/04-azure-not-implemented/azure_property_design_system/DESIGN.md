---
name: Azure Property Design System
colors:
  surface: '#f9f9fc'
  surface-dim: '#dadadc'
  surface-bright: '#f9f9fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f6'
  surface-container: '#eeeef0'
  surface-container-high: '#e8e8ea'
  surface-container-highest: '#e2e2e5'
  on-surface: '#1a1c1e'
  on-surface-variant: '#424654'
  inverse-surface: '#2f3133'
  inverse-on-surface: '#f0f0f3'
  outline: '#737686'
  outline-variant: '#c2c6d7'
  surface-tint: '#0055d3'
  primary: '#0053ce'
  on-primary: '#ffffff'
  primary-container: '#2a6cf0'
  on-primary-container: '#fefcff'
  inverse-primary: '#b2c5ff'
  secondary: '#585f6a'
  on-secondary: '#ffffff'
  secondary-container: '#dce3f0'
  on-secondary-container: '#5e6570'
  tertiary: '#9b4000'
  on-tertiary: '#ffffff'
  tertiary-container: '#c35200'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001848'
  on-primary-fixed-variant: '#0040a2'
  secondary-fixed: '#dce3f0'
  secondary-fixed-dim: '#c0c7d3'
  on-secondary-fixed: '#151c25'
  on-secondary-fixed-variant: '#404751'
  tertiary-fixed: '#ffdbcb'
  tertiary-fixed-dim: '#ffb692'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#7a3000'
  background: '#f9f9fc'
  on-background: '#1a1c1e'
  surface-variant: '#e2e2e5'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-margin: 24px
  gutter: 12px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  element-padding: 16px
---

## Brand & Style

This design system is built for a modern, high-end real estate and lifestyle audience. The brand personality is professional yet approachable, characterized by a "Clean Corporate" aesthetic that prioritizes clarity and ease of navigation. 

The visual direction leverages heavy whitespace and a systematic grid to create a sense of order and premium quality. It utilizes a mix of **Modern Minimalism** and **Tonal Layering** to guide the user's focus toward high-quality photography and essential action items. The emotional response is one of trust, efficiency, and aspiration.

## Colors

The palette is centered around a vibrant, high-saturation blue that serves as the primary driver for call-to-actions and brand highlights. 

- **Primary Blue:** Used for main action buttons and active states.
- **Secondary Blue:** A soft, low-opacity tint used for chip backgrounds and subtle highlights.
- **Neutral:** A deep near-black for primary text and a cool grey for secondary information.
- **Surface:** Pure white is the default background to maximize the impact of the photo grid.

## Typography

The typography uses **Plus Jakarta Sans** across all levels to maintain a soft, modern, and welcoming feel. 

Headlines use a tighter letter-spacing and semi-bold/bold weights to create a strong visual anchor. Body text remains clean with generous line heights to ensure readability in data-dense areas like property listings. Captions and small labels (like the "Welcome to" prefix) often use uppercase styling with increased letter spacing for an editorial touch.

## Layout & Spacing

This design system utilizes a **fluid grid** model optimized for mobile-first interaction. 

- **The Photo Grid:** Uses a 3-column masonry-inspired layout for home screens, with a consistent 12px gutter.
- **Margins:** Standardized 24px horizontal margins for all screen-level containers to provide "breathing room."
- **Stacking:** Elements within cards or forms follow an 8px (small) or 16px (medium) vertical rhythm.
- **Sheet Behavior:** Modal sheets and login cards use a bottom-anchored layout with generous top padding to signify depth.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Soft Ambient Shadows**.

- **Level 0 (Base):** Pure white background.
- **Level 1 (Cards/Sheets):** Elevated using a very soft, diffused shadow (Blur: 20px, Opacity: 4%, Y: 4) to create a subtle lift without harsh edges.
- **Overlays:** Full-screen modal overlays use a semi-transparent dark tint (40% opacity) to focus the user on the foreground sheet.
- **Dividers:** Minimalist 1px borders in a very light grey are used only when necessary to separate distinct content blocks.

## Shapes

The shape language is consistently **Rounded**.

- **Standard Buttons & Inputs:** Use a 12px - 16px radius to match the friendly brand voice.
- **Property Cards:** Use a 20px radius (`rounded-xl`) for large image containers to soften the overall interface.
- **Chips:** Fully pill-shaped for easy tap identification.
- **Input Fields:** Rounded corners with a subtle light-grey border (1px) ensure the forms feel integrated rather than heavy.

## Components

### Buttons
- **Primary:** Solid Blue background with white text. High contrast, slightly rounded (12px).
- **Secondary/Outline:** 1px Blue or Grey border with transparent background for less urgent actions (e.g., "Login" on the splash screen).

### Input Fields
- Container-style inputs with a 1px soft border.
- Icons are placed on the left side using a **linear, thin-stroke style** (2px stroke width).
- Placeholder text is a light grey (`#94A3B8`).

### Chips/Filters
- Small, pill-shaped elements.
- Active state: Primary Blue background with white text.
- Inactive state: Secondary Blue (tint) or Light Grey background with dark text.

### Cards
- Property cards feature a horizontal layout with a fixed-aspect-ratio image on the left.
- Includes a floating "Heart" icon for favorites, using a thin red outline or solid red fill for active states.
- Star ratings are displayed as a small overlay on the image container.

### Navigation
- Bottom navigation uses thin-line icons.
- Active state is indicated by a pill-shaped background highlight around the label and icon.