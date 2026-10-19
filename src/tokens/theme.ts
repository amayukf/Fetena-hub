/**
 * ExamVault Central Design Tokens
 * -------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for colors, typography, radii, spacing,
 * and elevation. Editing this file or updating CSS variables in
 * index.css restyles the entire application.
 */

export const theme = {
  colors: {
    // Primary Brand Colors
    accent: '#166b55',
    accentHover: '#0f5946',
    accentSoft: '#e8f3ef',

    // Neutrals & Surfaces
    ink: '#172522',
    inkSecondary: '#344541',
    muted: '#6c7c78',
    line: '#dfe7e4',
    canvas: '#f6f8f7',
    surface: '#ffffff',

    // Semantic States
    success: '#16825f',
    successSoft: '#e7f6ef',
    warning: '#9b6a14',
    warningSoft: '#fff4da',
    danger: '#b74646',
    dangerSoft: '#fcebea',
    infoSoft: '#edf3fa',

    // Dark Stage (Viewer)
    viewerBg: '#293330',
    viewerBar: '#17201e',
  },

  radii: {
    sm: '8px',
    md: '14px',
    lg: '22px',
    full: '9999px',
  },

  shadows: {
    card: '0 1px 2px rgba(20, 40, 35, 0.02)',
    soft: '0 8px 28px rgba(26, 52, 45, 0.07)',
    floating: '0 28px 70px rgba(22, 72, 58, 0.14)',
    viewer: '0 10px 50px rgba(0, 0, 0, 0.3)',
  },

  typography: {
    fontSans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSerif: 'Georgia, serif',
    fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    sizes: {
      display: 'clamp(2.5rem, 5vw, 4rem)',
      h1: 'clamp(2rem, 4vw, 3rem)',
      h2: '1.4rem',
      h3: '1.05rem',
      h4: '0.95rem',
      body: '0.9rem',
      small: '0.78rem',
      caption: '0.68rem',
    },
    weights: {
      regular: 400,
      medium: 500,
      semibold: 640,
      bold: 720,
      heavy: 760,
    },
  },

  spacing: {
    1: '8px',
    2: '16px',
    3: '24px',
    4: '32px',
    5: '40px',
    6: '48px',
    8: '64px',
    10: '80px',
  },

  constants: {
    appName: 'Fetena Hub',
    tagline: 'Prepare smarter with past exam papers.',
    university: 'Ambo University',
    campus: 'Ambo University',
    defaultSemesterFeeEtb: 50,
  },
} as const;

export type Theme = typeof theme;
export default theme;
