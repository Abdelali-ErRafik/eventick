"use client";

import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { I18nProvider } from "../i18n";
import { ThemeProvider } from "../ThemeContext";
import { AuthProvider } from "../AuthContext";
import { CartProvider } from "../CartContext";
import { FavoritesProvider } from "../FavoritesContext";
import App from "../App";

export default function ClientApp() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <CartProvider>
              <FavoritesProvider>
                <App />
                <Toaster position="top-center" />
              </FavoritesProvider>
            </CartProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
