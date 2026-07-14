import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Base — preto / branco / cinzas da marca
        ink: "#050505", // preto principal (texto/base)
        paper: "#f7f7f7", // fundo claro (areas de conteudo/tabela)
        surface: "#ffffff",
        line: "#e6e6e6", // borda em areas claras
        muted: "#6b7280", // texto secundario em fundo claro (>= AA)
        // Marca — vermelho
        brand: {
          DEFAULT: "#d40000",
          dark: "#a80000", // hover
          deep: "#7d0000", // texto sobre vermelho claro
          soft: "#fdECEC", // fundo vermelho bem claro
          200: "#f4a3a3" // vermelho claro p/ acentos em fundo escuro
        },
        // Chrome escuro (sidebar, login, headers)
        sidebar: "#050505",
        "sidebar-2": "#111111",
        "sidebar-line": "#2a2a2a",
        "sidebar-text": "#d1d5db", // cinza claro p/ textos secundarios no escuro
        // Semanticos
        danger: { DEFAULT: "#d40000", soft: "#fdecec" },
        warning: { DEFAULT: "#b45309", soft: "#fdf3e7" },
        success: { DEFAULT: "#0f9d58", dark: "#0a7d43", soft: "#e9f6ef" },
        // Tom neutro escuro (para KPIs informativos, no lugar de azul)
        info: { DEFAULT: "#111111", soft: "#f1f1f1" }
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif"
        ]
      },
      boxShadow: {
        soft: "0 1px 2px rgba(5, 5, 5, 0.05), 0 4px 12px rgba(5, 5, 5, 0.06)",
        lift: "0 2px 4px rgba(5, 5, 5, 0.06), 0 14px 30px rgba(5, 5, 5, 0.12)",
        ring: "0 0 0 4px rgba(212, 0, 0, 0.15)"
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem"
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.35s ease both",
        shimmer: "shimmer 1.6s infinite"
      }
    }
  },
  plugins: []
};

export default config;
