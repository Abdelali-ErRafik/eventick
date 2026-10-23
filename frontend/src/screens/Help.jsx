import { Shell } from "../components/Shell";

export default function Help() {
  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl">Aide</h1>
        <p className="mt-4 text-muted">
          Choisissez votre place, payez en ligne et recevez votre billet par e-mail et dans l'application.
        </p>
      </div>
    </Shell>
  );
}
