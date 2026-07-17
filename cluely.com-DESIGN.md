# Design System Inspired by Cluely

## 1. Visual Theme & Atmosphere

Cluely's design system embodies a sophisticated, modern aesthetic built on clean minimalism and professional elegance. The visual identity leverages serene blues, warm peachy tones, and soft earth greens against a luminous white canvas, creating an inviting yet trustworthy atmosphere. The design celebrates clarity and focus, with generous whitespace and thoughtful color blocking that guides attention to critical user actions. Typography combines the timeless serif elegance of EB Garamond for display text with the contemporary sans-serif precision of Geist for body content, establishing a hierarchy that feels both approachable and authoritative. The overall mood is calm, intelligent, and forward-thinking—reflecting an AI assistant that works seamlessly in the background while delivering real-time intelligence.

**Key Characteristics**
- Clean, spacious layouts with intentional negative space
- Sophisticated serif-to-sans-serif typographic contrast
- Subtle, refined color palette anchored in neutrals
- Soft, curved UI elements with generous border radius
- Transparent and glassmorphic component treatments
- Professional yet approachable visual language
- Emphasis on clarity, precision, and real-time data presentation

## 2. Color Palette & Roles

### Primary
- **Primary Blue** (`#263043`): Core brand identifier, used extensively for interactive states, primary CTAs, and dominant UI surfaces; conveys professionalism and trust
- **Deep Navy** (`#18171C`): Secondary primary for dark overlays, text emphasis, and background containers; reinforces depth and hierarchy

### Accent Colors
- **Warm Blush** (`#F4C9C8`): Soft accent for highlights, complementary status states, and gentle visual flourishes
- **Soft Sage** (`#A7C3A8`): Subtle accent for success states, positive reinforcement, and harmonious design layering
- **Deep Burgundy** (`#481F1E`): Dark accent for warning states or deep contextual backgrounds
- **Forest Green** (`#2D492E`): Deep accent for security, completed states, and grounded design elements
- **Cool Gray** (`#8C929D`): Mid-tone accent for secondary UI and transitional states

### Interactive
- **Interactive Primary** (`#263043`): Button hover states, focused form fields, and active navigation items
- **Interactive Muted** (`#B2B3BA`): Secondary interaction surface for less critical actions; maintains visual hierarchy while remaining interactive
- **Link Color** (`#FFFFFF`): Default link text on dark backgrounds; maintains contrast and readability

### Neutral Scale
- **White** (`#FFFFFF`): Primary surface color, high-contrast text backgrounds, and card containers
- **Near White** (`#F5F5F5`): Subtle background differentiation, hover states for neutral elements
- **Light Gray** (`#EDEEF2`): Secondary surface background, subtle borders, and dividers
- **Medium Gray** (`#E4E4E7`): Tertiary surface, form field borders, and inactive UI elements
- **Gray Text** (`#B2B3BA`): Secondary and tertiary text hierarchy, disabled states
- **Dark Gray** (`#898B91`): Mid-tone text for reduced emphasis; bridges primary and background colors
- **Charcoal** (`#9B9B9B`): Placeholder text and subdued UI elements

### Surface & Borders
- **Border Neutral** (`#E4E4E7`): Default border color for cards, inputs, and container edges
- **Surface Default** (`#FFFFFF`): Primary container background
- **Surface Secondary** (`#EDEEF2`): Subtle layered surfaces and section dividers
- **Surface Tertiary** (`#F5F5F5`): Minimal contrast alternative surfaces

### Semantic / Status
- **Success Green** (`#A7C3A8`): Positive confirmations, validated states, completed actions
- **Warning Accent** (`#F4C9C8`): Attention-requiring states, cautionary messages
- **Depth Overlay** (`#040406`): Near-black overlay for modal backdrops and depth emphasis

## 3. Typography Rules

### Font Family
- **Primary Display Font**: EB Garamond (serif)
  - Fallback stack: `'EB Garamond', Georgia, serif`
  - Usage: Hero headlines, display text, premium positioning
- **Secondary Body Font**: Geist (sans-serif)
  - Fallback stack: `'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  - Usage: Body copy, UI text, interface labels, all secondary typography

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|----|
| Display / H1 | EB Garamond | 80px | 500 | 76.8px | 0px | Hero headlines, page titles |
| Heading / H2 | Geist | 19px | 500 | 26.6px | 0px | Secondary section headers |
| Heading / H3 | Geist | 28px | 500 | 35px | 0px | Primary section headers |
| Body Large | Geist | 16px | 400 | 24px | 0px | Primary body text, spans |
| Body Standard | Geist | 12px | 400 | 19.2px | 0px | Secondary body, descriptions |
| Button Text | Geist | 16px | 500 | 24px | 0px | Button labels, CTAs |
| Button Small | Geist | 12px | 500 | 16px | 0px | Secondary button labels |
| Input Text | Geist | 13px | 400 | 19.5px | 0px | Form field text, placeholders |

### Principles
- **Serif-Sans Contrast**: EB Garamond provides visual distinction and premium feel for primary headlines; Geist provides clarity and efficiency for all interface content
- **Weight Hierarchy**: 500 weight signals actionable elements (buttons, headings); 400 weight recedes to support content
- **Line Height Breathing**: Generous line heights (1.2–1.5× size) ensure legibility in body text; tighter ratios for display work emphasize presence
- **Size Relationships**: Each size tier represents distinct information hierarchy; sizes progress in meaningful intervals
- **Accessibility First**: Minimum 12px for body text; 16px+ for primary UI text ensures WCAG compliance

## 4. Component Stylings

### Buttons

#### Primary CTA Button
- **Background**: `rgba(0, 0, 0, 0)` (transparent with gradient shadow effect)
- **Text Color**: `#FFFFFF`
- **Font Size**: `16px`
- **Font Weight**: `500`
- **Font Family**: Geist
- **Padding**: `10px 20px`
- **Border Radius**: `12px`
- **Border**: `0px solid #E4E4E7`
- **Box Shadow**: `rgba(148, 172, 243, 0.4) 20px 20px 24px 0px, rgba(191, 229, 251, 0.4) -3px -3px 4px 0px inset, rgba(19, 26, 228, 0.1) 4px 4px 4px 0px inset`
- **Height**: Auto
- **Width**: Fit-content
- **Line Height**: `24px`
- **Hover State**: Intensify shadow depth by increasing blur radius to `28px`; increase outer offset to `24px 24px`
- **Active State**: Reduce inset shadow opacity to `0.2`; darken outer shadow

#### Secondary Button (Icon)
- **Background**: `rgba(0, 0, 0, 0)`
- **Text Color**: `#FFFFFF`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Padding**: `0px`
- **Border Radius**: `0px`
- **Height**: `24px`
- **Width**: `24px`
- **Border**: None
- **Box Shadow**: None
- **Hover State**: Add `background: rgba(255, 255, 255, 0.1)` with `border-radius: 4px`
- **Notes**: Minimal button for icon-only interactions

#### Tertiary Button (Pill-style)
- **Background**: `rgba(0, 0, 0, 0)`
- **Text Color**: `#FFFFFF`
- **Font Size**: `12px`
- **Font Weight**: `500`
- **Padding**: `0px 12px`
- **Border Radius**: `3.35544e+07px` (full pill/capsule)
- **Height**: `32px`
- **Box Shadow**: `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(175, 179, 196) 0px 0.7px 0px 0px inset`
- **Line Height**: `16px`
- **Hover State**: Shift text color to `rgba(255, 255, 255, 0.8)`
- **Notes**: Used for compact, secondary actions

#### Ghost Button (Black)
- **Background**: `rgba(0, 0, 0, 0)`
- **Text Color**: `#000000`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Padding**: `0px`
- **Border Radius**: `3.35544e+07px` (full pill)
- **Height**: `32px`
- **Width**: `32px`
- **Box Shadow**: `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(175, 179, 196) 0px 0.7px 0px 0px inset`
- **Hover State**: Add subtle underline or slight opacity increase

### Cards & Containers

#### Large Hero Card
- **Background**: `rgba(0, 0, 0, 0)` (transparent)
- **Text Color**: `#000000`
- **Padding**: `112px 112px 0px 112px`
- **Border Radius**: `24px`
- **Border**: None
- **Box Shadow**: None
- **Height**: Variable; min `541px`
- **Width**: Variable; typical `896px`
- **Notes**: Large hero container for hero imagery and headline sections

#### Standard Card
- **Background**: `rgba(0, 0, 0, 0)` (transparent)
- **Text Color**: `#000000`
- **Padding**: `22px 22px 22px 22px`
- **Border Radius**: `24px`
- **Border**: `0px solid #E4E4E7` (optional subtle border)
- **Box Shadow**: None (or subtle: `rgba(0, 0, 0, 0.04) 0px 2px 8px`)
- **Height**: Auto; typical `366px`
- **Width**: `384px`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Line Height**: `24px`
- **Hover State**: Lift with `box-shadow: rgba(0, 0, 0, 0.08) 0px 4px 16px`
- **Notes**: Reusable container for feature blocks, testimonials, or content modules

#### Image Container Card
- **Background**: `rgba(0, 0, 0, 0)`
- **Padding**: `0px`
- **Border Radius**: `24px`
- **Height**: `366px`
- **Width**: `384px`
- **Overflow**: Hidden (to respect border radius)
- **Notes**: Card designed specifically for image content; padding removed to allow image to fill

### Inputs & Forms

#### Text Input Field
- **Background**: `rgba(0, 0, 0, 0)` (transparent)
- **Text Color**: `#FFFFFF`
- **Font Size**: `13px`
- **Font Weight**: `400`
- **Font Family**: Geist
- **Padding**: `10px 10px 8px 10px`
- **Border Radius**: `0px` (no rounding)
- **Border**: `0px solid #E4E4E7`
- **Box Shadow**: `rgba(0, 0, 0, 0.05) 0px 2px 20px -1px inset`
- **Height**: `37.5px`
- **Width**: Variable (typical `456px–490px`)
- **Line Height**: `19.5px`
- **Placeholder Text Color**: `#9B9B9B`
- **Focus State**: 
  - `box-shadow: rgba(0, 0, 0, 0.08) 0px 2px 20px -1px inset, rgba(38, 48, 67, 0.2) 0px 0px 0px 2px`
  - `border-color: #263043`
- **Disabled State**:
  - `background: #F5F5F5`
  - `color: #B2B3BA`
  - `cursor: not-allowed`
- **Notes**: Minimal, flat input with subtle inset shadow for depth

### Navigation

#### Header Navigation Bar
- **Background**: `rgba(0, 0, 0, 0)` (transparent, positioned over hero image)
- **Text Color**: `#000000` (or `#FFFFFF` on dark backgrounds)
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Font Family**: Geist
- **Padding**: `0px` (use flex gap for spacing)
- **Border Radius**: `0px`
- **Border**: None
- **Box Shadow**: None
- **Height**: `156px` (includes logo and nav items vertically stacked or horizontal)
- **Width**: Variable; typical `549px` for nav items container
- **Line Height**: `24px`
- **Link Styling**:
  - **Inactive**: `color: #FFFFFF; text-decoration: none`
  - **Hover**: `color: rgba(255, 255, 255, 0.8); underline: none`
  - **Active**: `color: #FFFFFF; font-weight: 500; border-bottom: 2px solid #FFFFFF`
- **Notes**: Flexible, transparent navigation suitable for overlay on hero images

#### Link Component (Standard)
- **Background**: `rgba(0, 0, 0, 0)`
- **Text Color**: `#FFFFFF`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Padding**: `0px`
- **Border Radius**: `4px`
- **Border**: None
- **Box Shadow**: None
- **Height**: `22px`
- **Width**: Auto
- **Line Height**: `24px`
- **Hover State**: Add `text-decoration: underline`; shift color to `rgba(255, 255, 255, 0.9)`
- **Notes**: Inline navigation and action links

#### Link Component (Label)
- **Background**: `rgba(0, 0, 0, 0)`
- **Text Color**: `#FFFFFF`
- **Font Size**: `14px`
- **Font Weight**: `500`
- **Padding**: `8px 14px`
- **Border Radius**: `0px`
- **Height**: `36px`
- **Width**: Auto
- **Line Height**: `20px`
- **Hover State**: `background: rgba(255, 255, 255, 0.1)`
- **Notes**: Styled navigation label with padding for larger touch targets

## 5. Layout Principles

### Spacing System

Base unit: `4px`

**Spacing Scale**:
- `4px` – Micro spacing for internal padding within compact components
- `8px` – Extra-small gap for tightly related elements
- `12px` – Small padding for form fields and compact containers
- `16px` – Small-to-medium gap; standard inter-element spacing
- `20px` – Medium gap for related content blocks
- `24px` – Medium padding for card and container interiors
- `28px` – Medium-large gap for section spacing
- `32px` – Large padding for major container sections
- `40px` – Large padding for hero and standout sections
- `44px` – Extra-large gap for distinct content zones
- `48px` – Extra-large gap for major page sections
- `56px` – Maximum gap for vertical rhythm between major sections

**Usage Context**:
- Micro (`4px–8px`): Icon spacing, badge padding, inline elements
- Small (`12px–16px`): Form field padding, button internals, list items
- Medium (`20px–32px`): Card interiors, section padding, component layering
- Large (`40px–56px`): Hero sections, page margins, major vertical dividers

### Grid & Container

- **Max Width**: `1200px` (typical for full-width layouts on desktop)
- **Column Strategy**: 12-column flexible grid with 16px gutter spacing
- **Container Padding**: 
  - Desktop: `40px` left/right
  - Tablet: `32px` left/right
  - Mobile: `20px` left/right
- **Section Patterns**:
  - Hero sections: Full bleed with internal padding of `40px–112px`
  - Content sections: Max-width centered container with `48px` vertical margin
  - Feature grids: 3-column desktop, 2-column tablet, 1-column mobile at `384px` card width

### Whitespace Philosophy

Cluely embraces generous whitespace as a core design principle. Negative space is treated as an active design element that reduces cognitive load, directs focus, and conveys sophistication. Every section maintains breathing room with consistent `48px–56px` vertical gaps. Cards and content modules are intentionally spaced to feel distinct rather than crowded. This philosophy reflects the product's positioning: a clean, focused intelligence layer that brings clarity to meeting management, mirrored in the UI's uncluttered aesthetic.

### Border Radius Scale

- `0px` – Sharp edges for inputs, form containers, and minimalist UI
- `4px` – Subtle rounding for hover states, secondary containers
- `6px` – Image corners, small card variations
- `12px` – Primary button rounding; balanced, friendly feel
- `13px` – Large image containers, featured imagery
- `24px` – Card and major container rounding; soft, approachable
- `3.35544e+07px` (represented as max value) – Full pill/capsule rounding for buttons and badges

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (Level 0) | `box-shadow: none; background: solid color` | Base surfaces, cards on white background, form fields |
| Subtle (Level 1) | `box-shadow: rgba(0, 0, 0, 0.04) 0px 2px 8px; inset shadow: rgba(255, 255, 255, 0.5) 0px 0.7px 0px inset` | Hover states on cards, subtle lifted containers, soft borders |
| Moderate (Level 2) | `box-shadow: rgba(0, 0, 0, 0.08) 0px 4px 16px; inset shadow: rgba(191, 229, 251, 0.4) -3px -3px 4px 0px inset` | Primary button default state, active interactive elements |
| Rich (Level 3) | `box-shadow: rgba(148, 172, 243, 0.4) 20px 20px 24px 0px, rgba(191, 229, 251, 0.4) -3px -3px 4px 0px inset, rgba(19, 26, 228, 0.1) 4px 4px 4px 0px inset` | Featured CTA buttons, highlighted components, focal point emphasis |
| Deep (Level 4) | `box-shadow: rgb(12, 68, 161) 0px 0px 0px 0.5px, rgb(2, 44, 112) 0px -1px 0px 0px inset, rgb(129, 182, 255) 0px 0.5px 0px 0px inset` | Pressed states, deep interactive feedback |
| Modal / Overlay | `box-shadow: rgba(0, 0, 0, 0.3) 0px 10px 40px, inset shadows for glass effect` | Modals, toasts, overlaid panels |

**Shadow Philosophy**:
Cluely uses sophisticated, multi-layered shadows that combine outer depth shadows with inset highlights to create a subtle glass-morphic or frosted-glass effect. This approach differentiates the system from flat design while maintaining elegance and clarity. Shadows serve both functional (elevation indication) and aesthetic (premium feel) purposes. Outer shadows use cool blue tones to harmonize with the brand's primary palette, while inset highlights suggest light interaction and depth layering. This creates a refined, modern appearance that feels both elevated and grounded.

## 7. Do's and Don'ts

### Do
- Use the 12-column grid system with 16px gutters for consistent layout rhythm
- Apply generous whitespace (48px–56px) between major sections to reduce cognitive load
- Employ EB Garamond exclusively for display/hero text; reserve Geist for all interface and body content
- Stack card shadows (outer + inset) to achieve depth without excessive visual weight
- Maintain transparent backgrounds for buttons and inputs with subtle inset shadows for dimensionality
- Use the primary blue (`#263043`) intentionally for primary CTAs and interactive focus states
- Size typography according to the hierarchy table; never deviate from defined px values
- Apply consistent 24px border radius to cards and container blocks for visual cohesion
- Test all components on the light (#FFFFFF) background; design-system assumes light-mode default
- Use pill-shaped buttons (`3.35544e+07px` radius) exclusively for compact, secondary actions

### Don't
- Mix serif and sans-serif fonts within a single text block; maintain clear font family separation
- Apply box shadows to form inputs beyond the subtle inset effect (`rgba(0, 0, 0, 0.05) 0px 2px 20px -1px inset`)
- Use colors outside the defined palette; maintain strict adherence to hex values for brand consistency
- Reduce padding below 12px in card interiors; maintain minimum 12px padding for content breathing room
- Apply border radius smaller than 12px to buttons; maintain consistency with primary button style
- Stack shadows more than three layers deep; excess layering creates visual noise rather than clarity
- Increase font weight beyond 500 for body content; reserve 600+ for special, limited use cases
- Use accent colors (`#F4C9C8`, `#A7C3A8`) for primary UI; reserve for complementary highlights and status states
- Deviate from the spacing scale; all gaps and padding must use defined 4px multiples
- Crop or constrain card border radius on image containers; maintain full 24px rounding

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|------------|
| Mobile | 320px–639px | Single-column layout, `20px` container padding, 100% card width, 14px base font, full-screen hero, stacked navigation |
| Tablet | 640px–1023px | 2-column grid (384px cards + 16px gutter), `32px` container padding, 16px base font, adjusted hero height (60px display font) |
| Desktop | 1024px–1439px | 3-column grid, `40px` container padding, 16px base font, full typography hierarchy, optimized hero |
| Wide | 1440px+ | 4-column grid or wider, centered max-width container (`1200px`), standard spacing scales |

### Touch Targets

- **Minimum touch target size**: `44px × 44px` (WCAG AA compliant)
- **Buttons**: All buttons minimum `32px` height; ideal `44px–48px` for primary actions on mobile
- **Links**: Minimum `24px` height; ideally `36px` on mobile with `8px` vertical padding
- **Form fields**: Minimum `37.5px` height (match mobile keyboard expectations)
- **Icon buttons**: `32px × 32px` minimum; `44px × 44px` preferred for primary navigation
- **Spacing between touch targets**: Minimum `8px` gap to prevent accidental adjacent taps

### Collapsing Strategy

- **Hero section**: Reduce max-height from `541px` to `360px` on tablet, `240px` on mobile; maintain 40px padding on mobile
- **Display typography (H1)**: Scale from `80px` (desktop) → `60px` (tablet) → `40px` (mobile); maintain 500 weight and serif font
- **Card grids**: 3-column (desktop) → 2-column (tablet) → 1-column (mobile); cards remain `384px` max-width on tablet, full-width minus padding on mobile
- **Navigation**: Horizontal flex layout (desktop) → hamburger menu toggle (tablet) → full-screen overlay (mobile)
- **Spacing**: Reduce by 25% on tablet, 50% on mobile (e.g., `56px` gap → `42px` → `28px`)
- **Images**: Scale container dimensions proportionally; maintain aspect ratio and border-radius consistency
- **Inputs**: Expand to 100% width on mobile minus container padding; maintain `37.5px` height minimum

## 9. Agent Prompt Guide

### Quick Color Reference

- **Primary CTA**: Primary Blue (`#263043`)
- **Secondary CTA / Button Muted**: Gray (`#B2B3BA`)
- **Success / Positive State**: Soft Sage (`#A7C3A8`)
- **Warning / Attention**: Warm Blush (`#F4C9C8`)
- **Heading Text (Dark)**: Deep Navy (`#18171C`)
- **Body Text (Light)**: Primary Blue (`#263043`)
- **Body Text (Dark backgrounds)**: White (`#FFFFFF`)
- **Background / Surface**: White (`#FFFFFF`)
- **Surface Secondary**: Light Gray (`#EDEEF2`)
- **Borders / Dividers**: Medium Gray (`#E4E4E7`)
- **Placeholder Text**: Charcoal (`#9B9B9B`)
- **Disabled Text**: Medium Gray (`#B2B3BA`)
- **Links**: White (`#FFFFFF`) on dark; Primary Blue (`#263043`) on light

### Iteration Guide

1. **Typography First**: All display text uses EB Garamond 80px / 500 weight; all interface text uses Geist 16px / 400–500 weight as per hierarchy table. Never deviate from these font families or defined sizes.

2. **Spacing Discipline**: All spacing uses the 4px base unit scale (`4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `28px`, `32px`, `40px`, `44px`, `48px`, `56px`). No arbitrary spacing values.

3. **Card Consistency**: Every card uses 24px border radius, 22px padding (or 0px for image-only), transparent background, and optional `rgba(0, 0, 0, 0.04) 0px 2px 8px` shadow. No exceptions.

4. **Button Shadow Stack**: Primary buttons stack three shadows: outer depth (`rgba(148, 172, 243, 0.4) 20px 20px 24px 0px`), inset light (`rgba(191, 229, 251, 0.4) -3px -3px 4px 0px inset`), and inset accent (`rgba(19, 26, 228, 0.1) 4px 4px 4px 0px inset`). Secondary and tertiary buttons use simplified or no shadows.

5. **Input Styling**: All text inputs use transparent background, 13px Geist font, 37.5px height, 10px–12px horizontal padding, flat borders (0px radius), and inset shadow only: `rgba(0, 0, 0, 0.05) 0px 2px 20px -1px inset`. On focus, add outer ring: `rgba(38, 48, 67, 0.2) 0px 0px 0px 2px`.

6. **Color Precision**: Use UPPERCASE hex values exclusively. Primary interactive color is `#263043`. Neutral surfaces are `#FFFFFF` (primary) and `#EDEEF2` (secondary). Accents are `#F4C9C8`, `#A7C3A8`, and `#481F1E`. Every implementation must match these values exactly.

7. **Responsive Breakpoints**: Collapse layouts at 1024px (tablet), 640px (mobile). Reduce spacing by 25% on tablet, 50% on mobile. Maintain 44px minimum touch targets. Adjust typography size down one tier on mobile (e.g., H1 `80px` → `40px`).

8. **Accessibility Baseline**: Minimum font size `12px` for body text. All text on backgrounds must meet WCAG AA contrast (4.5:1 for normal, 3:1 for large text). Maintain focus states with visible 2px outline in `rgba(38, 48, 67, 0.2)`.

9. **Hero & Feature Sections**: Hero containers use `40px`–`112px` padding with full-bleed background images. Feature cards scale in 3-column grids on desktop, 2-column on tablet, 1-column on mobile. Maintain 384px card width baseline; flex to 100% on mobile minus 20px container padding.

10. **Whitespace Breathing Room**: Never compress vertical spacing below 48px between major sections. Cards and modules should feel distinct with clear gaps. This whitespace hierarchy reinforces the product's focus on clarity and reduces cognitive overload during UI interaction.