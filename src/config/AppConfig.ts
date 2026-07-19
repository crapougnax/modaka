export class AppConfig {
  static readonly name = 'Modaka';
  static readonly logoText = 'SB';
  static readonly logoEmoji = '🧠';
  static readonly tagline = 'Votre base de connaissances locale-first';
  static readonly apiMode: 'native-bridge' | 'hosted-api' = 'native-bridge';
  
  // Theme styling tokens (matching the CSS properties)
  static readonly theme = {
    fontHeading: "'Space Grotesk', sans-serif",
    fontBody: "'Nunito', sans-serif",
    colors: {
      bg: '#0b0c10',
      containerBg: '#12141c',
      cardTeal: '#1a2f3b',
      cardGreen: '#143d28',
      cardOrange: '#402213',
      cardGrey: '#212530',
      textWhite: '#ffffff',
      textMuted: '#94a3b8',
      vividGreen: '#22c55e',
      vividYellow: '#facc15',
      vividOrange: '#f97316',
      vividRed: '#ef4444',
      vividNavy: '#0f172a'
    },
    dimensions: {
      heightAction: '76px',
      heightNav: '96px'
    }
  };

  /**
   * Returns a CSS-injectable style block derived from this configuration.
   */
  static getCssVariablesString(): string {
    const { colors, dimensions } = this.theme;
    return `
      :root {
        --font-heading: ${this.theme.fontHeading};
        --font-body: ${this.theme.fontBody};
        
        --color-bg: ${colors.bg};
        --color-container-bg: ${colors.containerBg};
        --color-card-teal: ${colors.cardTeal};
        --color-card-green: ${colors.cardGreen};
        --color-card-orange: ${colors.cardOrange};
        --color-card-grey: ${colors.cardGrey};
        
        --color-text-white: ${colors.textWhite};
        --color-text-muted: ${colors.textMuted};
        
        --color-vivid-green: ${colors.vividGreen};
        --color-vivid-yellow: ${colors.vividYellow};
        --color-vivid-orange: ${colors.vividOrange};
        --color-vivid-red: ${colors.vividRed};
        --color-vivid-navy: ${colors.vividNavy};
        
        --height-action: ${dimensions.heightAction};
        --height-nav: ${dimensions.heightNav};
      }
    `;
  }
}
