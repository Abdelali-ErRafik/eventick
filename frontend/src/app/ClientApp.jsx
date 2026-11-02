"use client";

import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { I18nProvider } from "../i18n";
import { ThemeProvider } from "../ThemeContext";
import { AuthProvider } from "../AuthContext";
import { CartProvider } from "../CartContext";
import { CatalogProvider } from "../CatalogContext";
import { FavoritesProvider } from "../FavoritesContext";
import App from "../App";

/**
 * The locale prefix this page is being served under, as a router basename.
 *
 * `/ar/explorer` has to reach the same <Route path="/explorer">, so the
 * prefix is stripped once here rather than every route gaining an optional
 * `:locale` segment. Setting it as the basename also makes every <Link> keep
 * the prefix automatically — a visitor who arrived on /ar/ stays inside /ar/
 * as they browse, which is what makes the URL worth advertising.
 *
 * Computed at module scope, not in state: it cannot change without a full
 * document load, since switching language rewrites the URL.
 */
function localeBasename() {
  if (typeof window === "undefined") return undefined;
  const first = window.location.pathname.split("/")[1];
  return first === "fr" || first === "ar" ? `/${first}` : undefined;
}

export default function ClientApp() {
  return (
    <BrowserRouter basename={localeBasename()}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <CatalogProvider>
              <CartProvider>
                <FavoritesProvider>
                  <App />
                  <Toaster position="top-center" />
                </FavoritesProvider>
              </CartProvider>
            </CatalogProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
