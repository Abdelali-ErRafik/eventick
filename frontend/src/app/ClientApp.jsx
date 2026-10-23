"use client";

import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "../i18n";
import { AuthProvider } from "../AuthContext";
import { CartProvider } from "../CartContext";
import App from "../App";

export default function ClientApp() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
