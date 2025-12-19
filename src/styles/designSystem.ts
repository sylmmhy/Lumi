// Design System Guide - The Mindboat
// Based on transparent glass morphism and ocean theme with Apple-inspired depth

export const designSystem = {
  // Color Palette
  colors: {
    // Enhanced transparent glass morphism backgrounds with subtle tinting
    glass: {
      primary: 'bg-gradient-to-br from-white/12 via-white/8 to-white/6 backdrop-blur-2xl',
      secondary: 'bg-gradient-to-br from-white/10 via-white/6 to-white/4 backdrop-blur-xl',
      overlay: 'bg-gradient-to-br from-white/15 via-white/8 to-white/5',
      subtle: 'bg-gradient-to-br from-white/8 via-white/5 to-white/3 backdrop-blur-lg',
      // New tinted glass backgrounds with #5B8393 for better contrast
      tinted: 'bg-gradient-to-br from-slate-500/20 via-slate-400/15 to-slate-600/25 backdrop-blur-2xl',
      tintedSecondary: 'bg-gradient-to-br from-slate-500/15 via-slate-400/10 to-slate-600/20 backdrop-blur-xl',
      tintedSubtle: 'bg-gradient-to-br from-slate-500/12 via-slate-400/8 to-slate-600/15 backdrop-blur-lg',
    },
    
    // Button styles with enhanced depth and Apple-inspired sizing
    buttons: {
      // Enhanced glass button with Apple-style proportions
      glass: 'bg-gradient-to-br from-white/15 via-white/10 to-white/8 hover:from-white/20 hover:via-white/15 hover:to-white/12 border border-white/25 hover:border-white/35 text-white/90 hover:text-white backdrop-blur-md',
      // Tinted glass button for better contrast
      glassTinted: 'bg-gradient-to-br from-slate-500/20 via-slate-400/15 to-slate-600/25 hover:from-slate-500/25 hover:via-slate-400/20 hover:to-slate-600/30 border border-white/25 hover:border-white/35 text-white backdrop-blur-md',
      // Accent button for important actions
      accent: 'bg-gradient-to-r from-blue-400/30 to-purple-400/30 hover:from-blue-400/40 hover:to-purple-400/40 text-white border border-white/25 backdrop-blur-md',
      // Danger/warning button
      danger: 'bg-red-400/20 hover:bg-red-400/30 border border-red-300/30 text-white backdrop-blur-md',
    },
    
    // Text colors
    text: {
      primary: 'text-white',
      secondary: 'text-white/95',
      muted: 'text-white/80',
      subtle: 'text-white/70',
    },
    
    // Border colors
    borders: {
      glass: 'border-white/25',
      glassHover: 'border-white/35',
      accent: 'border-white/30',
    }
  },

  // Typography
  typography: {
    fonts: {
      heading: 'font-playfair',
      body: 'font-inter',
    },
    sizes: {
      xs: 'text-xs',
      sm: 'text-sm', 
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
      '4xl': 'text-4xl',
    },
    weights: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    }
  },

  // Spacing & Layout - Apple-inspired button sizing
  spacing: {
    // Consistent padding for components
    component: {
      sm: 'p-4',
      md: 'p-6', 
      lg: 'p-8',
      xl: 'p-10',
    },
    // Apple-style button padding - more compact
    button: {
      xs: 'px-6 py-1.5',  // Extra small for secondary actions
      sm: 'px-8 py-2',    // Small for back/cancel buttons
      md: 'px-10 py-2.5', // Medium for primary actions
      lg: 'px-12 py-2.5', // Large for important CTAs
    },
    // Gaps between elements
    gap: {
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8',
    }
  },

  // Effects & Animations
  effects: {
    // Enhanced backdrop blur for better glass morphism
    blur: {
      sm: 'backdrop-blur-sm',
      md: 'backdrop-blur-md',
      lg: 'backdrop-blur-lg',
      xl: 'backdrop-blur-xl',
      '2xl': 'backdrop-blur-2xl',
      '3xl': 'backdrop-blur-3xl',
    },
    
    // Apple-inspired shadow system with multiple layers
    shadows: {
      glass: 'shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.1)]',
      button: 'shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.1)]',
      buttonHover: 'shadow-[0_6px_20px_rgba(0,0,0,0.15),0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.15)]',
      accent: 'shadow-[0_8px_24px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]',
      strong: 'shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.15)]',
      input: 'shadow-[inset_0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)]',
    },
    
    // Transitions
    transitions: {
      default: 'transition-all duration-300',
      fast: 'transition-all duration-200',
      slow: 'transition-all duration-500',
    },
    
    // Hover effects
    hover: {
      scale: 'hover:scale-[1.02] active:scale-[0.98]',
      subtle: 'hover:scale-105',
    }
  },

  // Border Radius
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl', 
    lg: 'rounded-2xl',
    xl: 'rounded-3xl',
    full: 'rounded-full',
  },

  // Component Patterns
  patterns: {
    // Enhanced glass panel with Apple-inspired depth
    glassPanel: `
      bg-gradient-to-br from-white/12 via-white/8 to-white/6 backdrop-blur-2xl 
      border border-white/25 rounded-3xl 
      shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.15)]
      relative overflow-hidden
      before:absolute before:inset-0 before:rounded-3xl 
      before:bg-gradient-to-br before:from-white/8 before:via-transparent before:to-transparent 
      before:pointer-events-none
    `,
    
    // Tinted glass panel for better contrast
    glassPanelTinted: `
      bg-gradient-to-br from-slate-500/20 via-slate-400/15 to-slate-600/25 backdrop-blur-2xl 
      border border-white/25 rounded-3xl 
      shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.15)]
      relative overflow-hidden
      before:absolute before:inset-0 before:rounded-3xl 
      before:bg-gradient-to-br before:from-slate-400/10 before:via-transparent before:to-transparent 
      before:pointer-events-none
    `,
    
    // Apple-style glass button with optimized sizing
    glassButton: `
      bg-gradient-to-br from-white/15 via-white/10 to-white/8 backdrop-blur-md 
      border border-white/25 hover:from-white/20 hover:via-white/15 hover:to-white/12 
      hover:border-white/35 text-white/90 hover:text-white
      rounded-xl transition-all duration-300 font-inter font-medium text-base
      shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.1)]
      hover:shadow-[0_6px_20px_rgba(0,0,0,0.15),0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.15)]
    `,
    
    // Tinted glass button for better contrast
    glassButtonTinted: `
      bg-gradient-to-br from-slate-500/20 via-slate-400/15 to-slate-600/25 backdrop-blur-md 
      border border-white/25 hover:from-slate-500/25 hover:via-slate-400/20 hover:to-slate-600/30 
      hover:border-white/35 text-white
      rounded-xl transition-all duration-300 font-inter font-medium text-base
      shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.1)]
      hover:shadow-[0_6px_20px_rgba(0,0,0,0.15),0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.15)]
    `,
    
    // Accent button with enhanced styling - vibrant gradient
    accentButton: `
      bg-gradient-to-b from-[#739CFC] to-[#AB89E8]
      hover:opacity-90 text-white rounded-xl
      transition-all duration-300 font-inter font-medium
      shadow-[0_4px_16.1px_0_rgba(0,0,0,0.25)]
    `,
    
    // Icon container with subtle enhancement
    iconContainer: `
      bg-gradient-to-br from-white/15 via-white/10 to-white/8 backdrop-blur-md 
      rounded-2xl flex items-center justify-center
      border border-white/25 shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06)]
      relative overflow-hidden
    `,
    
    // Tinted icon container for better contrast
    iconContainerTinted: `
      bg-gradient-to-br from-slate-500/20 via-slate-400/15 to-slate-600/25 backdrop-blur-md 
      rounded-2xl flex items-center justify-center
      border border-white/25 shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06)]
      relative overflow-hidden
    `,
    
    // Inner glow overlay - more subtle
    innerGlow: `
      absolute inset-0 bg-gradient-to-br from-white/8 via-transparent to-transparent 
      rounded-3xl pointer-events-none
    `,
    
    // Tinted inner glow overlay
    innerGlowTinted: `
      absolute inset-0 bg-gradient-to-br from-slate-400/10 via-transparent to-transparent 
      rounded-3xl pointer-events-none
    `,
    
    // Enhanced input field with depth
    inputField: `
      bg-black/15 backdrop-blur-md border border-white/25 rounded-xl 
      text-white placeholder-white/60 focus:outline-none focus:ring-2 
      focus:ring-white/30 focus:border-white/40 transition-all duration-300
      shadow-[inset_0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)]
    `,
    
    // Tinted input field for better contrast
    inputFieldTinted: `
      bg-gradient-to-br from-slate-600/20 via-slate-500/15 to-slate-700/25 backdrop-blur-md 
      border border-white/25 rounded-xl 
      text-white placeholder-white/60 focus:outline-none focus:ring-2 
      focus:ring-white/30 focus:border-white/40 transition-all duration-300
      shadow-[inset_0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)]
    `,
  }
};

// Helper functions for consistent styling with Apple-inspired sizing
export const getButtonStyle = (variant: 'glass' | 'glassTinted' | 'accent' | 'danger' = 'glass', size: 'xs' | 'sm' | 'md' | 'lg' = 'md') => {
  const baseStyle = designSystem.effects.transitions.default;
  const sizeStyle = designSystem.spacing.button[size];
  const variantStyle = variant === 'glass' ? designSystem.patterns.glassButton :
                      variant === 'glassTinted' ? designSystem.patterns.glassButtonTinted :
                      variant === 'accent' ? designSystem.patterns.accentButton :
                      designSystem.colors.buttons.danger;
  
  return `${baseStyle} ${sizeStyle} ${variantStyle}`;
};

export const getPanelStyle = (blur: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' = '2xl', tinted: boolean = false) => {
  const basePattern = tinted ? designSystem.patterns.glassPanelTinted : designSystem.patterns.glassPanel;
  return basePattern.replace('backdrop-blur-2xl', designSystem.effects.blur[blur]);
};

export const getIconContainerStyle = (tinted: boolean = false) => {
  return tinted ? designSystem.patterns.iconContainerTinted : designSystem.patterns.iconContainer;
};

export const getInnerGlowStyle = (tinted: boolean = false) => {
  return tinted ? designSystem.patterns.innerGlowTinted : designSystem.patterns.innerGlow;
};