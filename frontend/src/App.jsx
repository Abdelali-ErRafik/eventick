import { Route, Routes } from "react-router-dom";
import Home from "./screens/Home";
import Explorer from "./screens/Explorer";
import EventDetail from "./screens/EventDetail";
import Checkout from "./screens/Checkout";
import Confirmation from "./screens/Confirmation";
import Billets from "./screens/Billets";
import TicketDetail from "./screens/TicketDetail";
import ClaimShare from "./screens/ClaimShare";
import Login from "./screens/Login";
import Organiser from "./screens/Organiser";
import Pro from "./screens/pro/Pro";
import Help from "./screens/Help";
import Legal from "./screens/Legal";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/explorer" element={<Explorer />} />
      <Route path="/evenements/:slug" element={<EventDetail />} />
      <Route path="/paiement" element={<Checkout />} />
      <Route path="/confirmation/:orderId" element={<Confirmation />} />
      <Route path="/billets" element={<Billets />} />
      <Route path="/billet/:ticketId" element={<TicketDetail />} />
      {/* Public: the token is the credential, so a recipient with no account
          can claim a ticket someone gave them. */}
      <Route path="/billet-offert/:token" element={<ClaimShare />} />
      <Route path="/login" element={<Login />} />
      <Route path="/organiser" element={<Organiser />} />
      <Route path="/pro/*" element={<Pro />} />
      <Route path="/aide" element={<Help />} />
      <Route path="/legal" element={<Legal />} />
    </Routes>
  );
}
