---
name: Ugandan Rental Essence
colors:
  surface: '#fcf8f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf8f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0edec'
  surface-container-high: '#ebe7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#41493e'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#717a6c'
  outline-variant: '#c0c9ba'
  surface-tint: '#276c28'
  primary: '#003c08'
  on-primary: '#ffffff'
  primary-container: '#0a5514'
  on-primary-container: '#81c97a'
  inverse-primary: '#8fd887'
  secondary: '#5c5f5d'
  on-secondary: '#ffffff'
  secondary-container: '#dfe0dd'
  on-secondary-container: '#616361'
  tertiary: '#6c0002'
  on-tertiary: '#ffffff'
  tertiary-container: '#970004'
  on-tertiary-container: '#ff9e91'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#aaf5a0'
  primary-fixed-dim: '#8fd887'
  on-primary-fixed: '#002203'
  on-primary-fixed-variant: '#065312'
  secondary-fixed: '#e2e3e0'
  secondary-fixed-dim: '#c5c7c4'
  on-secondary-fixed: '#191c1b'
  on-secondary-fixed-variant: '#454745'
  tertiary-fixed: '#ffdad5'
  tertiary-fixed-dim: '#ffb4a9'
  on-tertiary-fixed: '#410001'
  on-tertiary-fixed-variant: '#930004'
  background: '#fcf8f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 20px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-gap: 48px
---

## Brand & Style

The design system is rooted in trust, clarity, and the warmth of a new home. Designed specifically for the Ugandan residential market, the aesthetic follows a **Corporate / Modern** direction with a strong leaning toward **Minimalism**. 

The goal is to provide a stress-free search experience. We achieve this through a "less is more" approach: heavy whitespace allows property imagery to shine, while a disciplined information hierarchy ensures that vital details (price, location, and verification status) are immediately legible. The tone is plain, reassuring, and direct, removing the friction often associated with house hunting. 

The visual mood is established by a warm off-white background that feels more domestic and inviting than a sterile pure white, paired with a deep forest green that signals stability and growth.

## Colors

The palette is strictly controlled to maintain a calm atmosphere.
- **Primary (Forest Green):** Used as the hallmark of trust. Reserved for primary call-to-action buttons, "Verified" badges, and successful state indicators.
- **Background & Surface:** We use a two-tier system. The base background is a warm off-white (`#F6F7F4`) to reduce eye strain, while active content areas and cards use pure white (`#FFFFFF`) to create subtle contrast.
- **Accent (Logo Red):** This is a high-utility color. It is strictly forbidden for decoration or emphasis; it is used exclusively for genuine error states, such as failed payments or critical form validation errors.
- **Neutrals:** Text is rendered in a soft black (`#0A0A0A`) for maximum legibility without the harshness of pure black. Secondary information uses a balanced grey (`#6B7280`).

## Typography

This design system utilizes **Hanken Grotesk** for its exceptional legibility and modern, approachable character. 

- **Headlines:** Large, calm, and grounded. We use tight letter spacing for display sizes to maintain a contemporary feel.
- **Body Text:** Optimized for long-form reading of property descriptions. We prioritize generous line heights (1.5x) to ensure users can scan listings quickly.
- **UGX Pricing:** Always rendered in `headline-md` or `headline-sm` with a `600` weight to ensure the most important information—the cost—is never missed.
- **Mobile Scaling:** On mobile devices, `display-lg` should scale down to `32px` to prevent awkward word wrapping.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a focus on vertical rhythm. 
- **Grid:** A 12-column grid for desktop and a 4-column grid for mobile.
- **Margins:** A consistent 20px safe area on mobile ensures content doesn't feel cramped against screen edges.
- **Spacing Rhythm:** Based on a 4px baseline. Most components should use 16px (`stack-md`) for internal padding and 32px (`stack-lg`) to separate distinct content blocks.
- **White Space:** Do not fear empty space. Large gaps between sections (48px+) are used to signal the transition from property details to contact information or similar listings.

## Elevation & Depth

To maintain a utilitarian and clean look, this design system avoids heavy shadows and skeuomorphism.
- **Tonal Layers:** Depth is primarily communicated through the contrast between the Warm Off-White background and the Pure White Surface cards.
- **Soft Shadows:** Only used on primary "Surface" elements like property cards or floating action buttons. Shadows must be extra-diffused: `0px 4px 20px rgba(10, 10, 10, 0.05)`.
- **Low-Contrast Outlines:** Interactive elements like input fields and secondary buttons use a 1px border in `Neutral Line` (#E5E7EB). This keeps the UI flat and professional.
- **Active State:** When a card is hovered or pressed, the shadow depth increases slightly, and the border color shifts to the primary green.

## Shapes

The shape language is "Rounded," striking a balance between the efficiency of a square and the friendliness of a circle. 
- **Standard Radius:** 12px (0.75rem) for cards, large buttons, and input fields.
- **Small Radius:** 8px (0.5rem) for chips, tags, and small utility buttons.
- **Verification Badge:** Uses a pill shape (fully rounded) to distinguish it from standard interactive elements.
- **Images:** All property photography must carry the standard 12px radius to match the UI containers.

## Components

### Buttons
- **Primary:** Solid Forest Green (#0A5514) with White text. Used for "Book Viewing" or "Contact Agent."
- **Secondary:** Outlined with Neutral Line (#E5E7EB) and Neutral Dark (#0A0A0A) text. Used for "Save to Favorites" or "Share."
- **Ghost:** No background or border, used for low-priority navigation like "View All."

### Property Cards
Cards are the core of the experience. They must include:
- A 12px rounded image container.
- A "Verified" badge (Green pill) positioned in the top-left of the image.
- A "Freshness line" (e.g., "Listed 2 hours ago") in Neutral Mid text.
- Price in UGX using a bold weight.

### Trust Signals
- **Verified Badge:** A Forest Green badge with a checkmark icon.
- **Free for Tenants:** A clear, text-based reassurance found near the final call-to-action on property pages to encourage conversion.

### Input Fields
- Labels are required for all inputs, rendered in `label-md`.
- Borders are 1px solid `Neutral Line`. 
- Focus state: Border changes to Forest Green with a subtle 2px outer glow of the same color at 10% opacity.

### Lists
Lists should be "Freshness-first." Each item is separated by a 1px `Neutral Line` divider with 16px of vertical padding to ensure a comfortable tap target for mobile users.